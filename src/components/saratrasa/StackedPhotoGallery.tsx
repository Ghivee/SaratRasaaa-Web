"use client";

import * as React from "react";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  src: string;
  alt: string;
  rotation: number;
  xOffset: number;
  yOffset: number;
}

const DEFAULT_PHOTOS: Photo[] = [
  { id: "1", src: "/hero.jpeg", alt: "Relawan beraksi 1", rotation: -4, xOffset: -4, yOffset: 2 },
  { id: "2", src: "/hero2.jpeg", alt: "Relawan beraksi 2", rotation: 3, xOffset: 6, yOffset: -3 },
  { id: "3", src: "/hero3.JPG", alt: "Relawan beraksi 3", rotation: -2, xOffset: 2, yOffset: 5 },
  { id: "4", src: "/hero4.png", alt: "Relawan beraksi 4", rotation: 5, xOffset: -3, yOffset: -2 },
];

const SWIPE_THRESHOLD = 80;

interface StackedPhotoGalleryProps {
  photos?: Photo[];
  className?: string;
}

export function StackedPhotoGallery({ photos = DEFAULT_PHOTOS, className }: StackedPhotoGalleryProps) {
  const [cards, setCards] = React.useState<Photo[]>(photos);
  
  // Track if we are currently animating a fly-out so we don't trigger multiple
  const [isSwiping, setIsSwiping] = React.useState(false);

  // A better approach using array rotation and layout animation:
  const moveNext = React.useCallback(() => {
    if (isSwiping) return;
    setIsSwiping(true);
    
    // We will just shift the array. The top card is the LAST item in the array.
    setCards((prev) => {
      const newCards = [...prev];
      const topCard = newCards.pop()!;
      // Put it at the beginning (bottom of stack)
      newCards.unshift(topCard);
      return newCards;
    });

    // Reset swiping lock after animation finishes
    setTimeout(() => setIsSwiping(false), 500);
  }, [isSwiping]);

  // Auto-rotate every 5 seconds if not interacting
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Find the top card's DOM element and simulate a click to trigger fly out
      const topCardEl = document.getElementById("polaroid-top");
      if (topCardEl && !isSwiping) {
        topCardEl.click();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isSwiping]);

  return (
    <div className={cn("relative w-full aspect-[4/5] sm:aspect-square max-w-[400px] lg:max-w-[440px] mx-auto mt-4 sm:mt-0", className)} style={{ perspective: 1200 }}>
      {cards.map((photo, index) => {
        const isTop = index === cards.length - 1;

        return (
          <Card
            key={photo.id}
            photo={photo}
            isTop={isTop}
            index={index}
            total={cards.length}
            onSwipe={() => moveNext()}
            id={isTop ? "polaroid-top" : undefined}
          />
        );
      })}
    </div>
  );
}

// Separate component to hold individual motion values (like drag x)
function Card({ 
  photo, 
  isTop, 
  index, 
  total,
  onSwipe,
  id
}: { 
  photo: Photo; 
  isTop: boolean; 
  index: number;
  total: number;
  onSwipe: () => void;
  id?: string;
}) {
  const controls = useAnimation();
  const [isFlying, setIsFlying] = React.useState(false);

  // We re-trigger animations when index changes
  React.useEffect(() => {
    if (isFlying) return; // if it's currently flying out, let that finish

    // Natural position in the stack
    const reverseIndex = total - 1 - index; // 0 is top, 1 is second, etc.
    const scale = Math.max(0.85, 1 - reverseIndex * 0.05);
    const yOffset = reverseIndex * 6; // slight stack drop
    
    controls.start({
      x: isTop ? 0 : photo.xOffset,
      y: isTop ? 0 : photo.yOffset + yOffset,
      scale: scale,
      rotate: isTop ? 0 : photo.rotation,
      opacity: reverseIndex > 3 ? 0 : 1, // hide cards too deep
      zIndex: index,
      boxShadow: isTop 
        ? "0 25px 50px -12px rgba(0,0,0,0.25)" 
        : "0 10px 20px -5px rgba(0,0,0,0.1)",
      transition: { 
        duration: 0.5, 
        delay: isTop ? 0 : 0.15, // slightly delayed for lower cards for realism
        type: "spring", 
        stiffness: 150, 
        damping: 15 
      }
    });
  }, [index, total, isTop, photo, controls, isFlying]);

  const handleDragEnd = async (e: any, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (Math.abs(offset) > SWIPE_THRESHOLD || Math.abs(velocity) > 500) {
      // Fly out!
      setIsFlying(true);
      const direction = offset > 0 ? 1 : -1;
      const flyDistance = direction * (window.innerWidth / 2 + 200);
      
      await controls.start({
        x: flyDistance,
        y: info.offset.y + (direction * 100),
        rotate: direction * 45,
        opacity: 0,
        transition: { 
          duration: 0.5, 
          ease: [0.34, 1.56, 0.64, 1] // overshoot cubic-bezier for realistic throw
        }
      });
      
      // Once it flew out, we tell parent to rearrange the array
      onSwipe();
      
      // Reset flying state so it can re-enter from bottom
      setIsFlying(false);
    } else {
      // Snap back
      controls.start({
        x: 0,
        y: 0,
        rotate: 0,
        transition: { type: "spring", stiffness: 300, damping: 20 }
      });
    }
  };

  return (
    <motion.div
      id={id}
      animate={controls}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.8}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileDrag={{ cursor: "grabbing", scale: 1.05 }}
      whileHover={isTop ? { scale: 1.02 } : {}}
      onClick={(e) => {
        // If it was just a click (no drag), let's also cycle it
        if (isTop) {
          // Let's manually trigger fly out to the right
          handleDragEnd(e, { offset: { x: 100, y: -20 }, velocity: { x: 600, y: 0 } } as any);
        }
      }}
      className={cn(
        "absolute inset-0 w-full h-full p-2.5 sm:p-3",
        "bg-white rounded-xl sm:rounded-2xl shadow-xl",
        "flex flex-col will-change-transform",
        isTop ? "cursor-grab" : "pointer-events-none"
      )}
    >
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-muted border border-border/20">
        <img
          src={photo.src}
          alt={photo.alt}
          className="w-full h-full object-cover pointer-events-none select-none"
          draggable={false}
        />
        {/* Inner shadow for photo realism */}
        <div className="absolute inset-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.1)] pointer-events-none rounded-lg" />
      </div>
    </motion.div>
  );
}
