# Clones locais do tawper-os

Há várias pastas no diretório pai apontando para o mesmo GitHub (`phedroborges/tawper-os`):

| Pasta | Uso |
|---|---|
| `tawper-os-agent-tools` | **Ativa** — CRM + WhatsApp + agente/tools |
| `tawper-os` | Núcleo antigo / outra branch |
| `tawper-os-whatsapp-agent` | Intermediária |
| `tawper-os-negocios` | Variante de layout |

Para não aplicar patch no clone errado: desenvolva só em `tawper-os-agent-tools` (ou um `git worktree`). As outras pastas podem ser apagadas quando ninguém mais as usar.
