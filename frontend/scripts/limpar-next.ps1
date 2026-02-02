# Para o erro UNKNOWN (errno -4094) ao abrir layout.js: limpa cache .next e dist
# 1. Pare o "npm run dev" (Ctrl+C no terminal)
# 2. Execute: .\scripts\limpar-next.ps1
# 3. Rode "npm run dev" de novo

$root = Split-Path $PSScriptRoot ".."
$removed = $false

foreach ($dir in @(".next", "dist")) {
    $path = Join-Path $root $dir
    if (Test-Path $path) {
        Write-Host "Removendo pasta $dir..."
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
        if (Test-Path $path) {
            Write-Host "AVISO: Nao foi possivel remover $dir (pode estar em uso)."
            Write-Host "Pare o 'npm run dev' (Ctrl+C), execute este script de novo e depois 'npm run dev'."
        } else {
            Write-Host "Pasta $dir removida."
            $removed = $true
        }
    }
}

if ($removed) {
    Write-Host "Pronto. Agora execute: npm run dev"
} elseif (-not (Test-Path (Join-Path $root ".next")) -and -not (Test-Path (Join-Path $root "dist"))) {
    Write-Host "Nenhuma pasta .next ou dist encontrada."
}
