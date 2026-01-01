# 🔄 Sistema de Atualização Automática

Sistema de auto-update com suporte a dois níveis de prioridade.

## 📁 Estrutura no Servidor

Suba para `https://membros.ferramentasguru.com/updates/`:

```
/updates/
├── latest.json                        ← Info da versão atual
├── index.html                         ← Página de download (opcional)
└── Ferramentas-Guru-Setup-X.X.X.exe   ← Instalador
```

---

## 📋 Formato do `latest.json`

```json
{
  "version": "1.0.1",
  "priority": "low",
  "releaseDate": "2026-01-02",
  "changelog": ["Nova funcionalidade X", "Correção de bugs"],
  "downloadUrl": "https://membros.ferramentasguru.com/updates/Ferramentas-Guru-Setup-1.0.1.exe"
}
```

### Campos:

| Campo         | Descrição                                    |
| ------------- | -------------------------------------------- |
| `version`     | Versão semântica (ex: "1.0.1")               |
| `priority`    | `"low"` = pode adiar, `"high"` = obrigatória |
| `releaseDate` | Data YYYY-MM-DD                              |
| `changelog`   | Lista de mudanças                            |
| `downloadUrl` | URL do instalador                            |

---

## 🎯 Prioridades

### `"low"` - Opcional

- 3 opções: "Atualizar Agora", "Depois", "Pular Versão"

### `"high"` - Obrigatória

- Só 1 opção: "Atualizar Agora" (app não funciona sem)
- Use para correções de segurança

---

## 🚀 Publicar Atualização

1. Alterar versão no `package.json`
2. `npm run make`
3. Subir `.exe` + `latest.json` no servidor
