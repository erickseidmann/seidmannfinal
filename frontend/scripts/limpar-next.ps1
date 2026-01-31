# Para o erro UNKNOWN ao abrir webpack.js: limpa o cache .next e reinicia
# Execute com: .\scripts\limpar-next.ps1
# Ou: pare o "npm run dev", apague a pasta .next e rode "npm run dev" de novo.

$nextPath = Join-Path $PSScriptRoot "..\.next"
if (Test-Path $nextPath) {
    Write-Host "Removendo pasta .next..."
    Remove-Item -Recurse -Force $nextPath -ErrorAction SilentlyContinue
    if (Test-Path $nextPath) {
        Write-Host "AVISO: Nao foi possivel remover .next (pode estar em uso)."
        Write-Host "Pare o 'npm run dev' (Ctrl+C), execute este script de novo e depois 'npm run dev'."
    } else {
        Write-Host "Pasta .next removida. Agora execute: npm run dev"
    }
} else {
    Write-Host "Pasta .next nao encontrada."
}
