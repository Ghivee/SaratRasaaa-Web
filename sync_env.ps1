$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Output ".env file not found!"
    exit
}

$keys = @()
$envs = @("production", "preview", "development")

Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*(?<key>[A-Za-z0-9_]+)=(?<val>.*)$") {
        $key = $matches['key']
        $val = $matches['val']
        
        # Trim leading and trailing quotes if present
        if ($val -match '^"(.*)"$') {
            $val = $matches[1]
        } elseif ($val -match "^'(.*)'$") {
            $val = $matches[1]
        }
        
        Write-Output "Removing existing key: $key"
        # Attempt to remove existing key (ignore errors if it doesn't exist)
        echo y | vercel env rm $key production preview development *>&1 | Out-Null
        echo y | vercel env rm $key *>&1 | Out-Null
        
        Write-Output "Adding key: $key"
        foreach ($env in $envs) {
            # Write out value to a temp file to avoid escaping issues in powershell pipe
            $val | Out-File -FilePath temp_val.txt -NoNewline -Encoding utf8
            cmd.exe /c "type temp_val.txt | vercel env add $key $env" *>&1 | Out-Null
        }
        $keys += $key
    }
}

Remove-Item temp_val.txt -ErrorAction SilentlyContinue

Write-Output "Done pushing all env variables!"
