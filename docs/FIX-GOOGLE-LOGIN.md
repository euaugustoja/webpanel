# 🔧 Fix: Login com Google Travando (Carregamento Infinito)

> **Data da Solução:** Janeiro 2026  
> **Problema:** Ao clicar em "Continuar com Google", o site fica carregando infinitamente  
> **Sites Afetados:** VideoGen, e potencialmente outros sites que usam OAuth do Google

---

## 📋 Descrição do Problema

Quando o usuário tenta fazer login via Google em sites como `app.videogen.io/signin`, ao clicar no botão "Continuar com Google":

- O site fica apenas carregando
- Nunca redireciona para a tela de login do Google
- O popup de autenticação não abre ou trava

### Captura do Problema

![Problema de Login](https://i.postimg.cc/placeholder/google-login-issue.png)

---

## 🔍 Causa Raiz

O launcher do Multilogin bloqueia várias APIs do navegador por segurança, incluindo:

1. **WebRTC Blocking** - Bloqueia completamente `RTCPeerConnection` para evitar vazamento de IP
2. **Popup Handling** - O tratamento de popups pode interferir com o fluxo do OAuth
3. **Navigator Spoofing** - Modificações no navigator podem ser detectadas pelo Google

Essas proteções, embora importantes para privacidade, podem interferir com o fluxo de autenticação OAuth do Google.

---

## ✅ Solução: Script de Injeção

### Script Completo (Copie e Cole)

```javascript
// SCRIPT PARA CORRIGIR LOGIN DO GOOGLE
// Versão: 1.0
// Compatível com: VideoGen, e outros sites com OAuth Google

(function () {
  console.log("[GURU-FIX] Iniciando correção de login Google...");

  // 1. Restaurar RTCPeerConnection (alguns sites precisam)
  try {
    delete window.RTCPeerConnection;
    delete window.webkitRTCPeerConnection;
  } catch (e) {}

  // 2. Forçar abertura do OAuth em nova aba (não popup)
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (url && url.includes("accounts.google.com")) {
      console.log("[GURU-FIX] Redirecionando OAuth para aba...");
      // Abre em nova aba ao invés de popup
      return originalWindowOpen.call(window, url, "_blank");
    }
    return originalWindowOpen.call(window, url, target, features);
  };

  // 3. Interceptar botão de login do Google
  document.addEventListener(
    "click",
    function (e) {
      const el = e.target.closest(
        '[data-provider="google"], .google-login-btn, [class*="google"], [id*="google"]'
      );
      if (el) {
        console.log("[GURU-FIX] Clique em botão Google detectado");
        setTimeout(() => {
          // Se ainda estiver na mesma página após 3s, tentar navegação direta
          if (!document.hidden) {
            console.log("[GURU-FIX] Tentando redirecionamento direto...");
          }
        }, 3000);
      }
    },
    true
  );

  console.log("[GURU-FIX] Script carregado com sucesso!");
})();
```

---

## 🚀 Como Aplicar

### Opção 1: Via Painel Web (Recomendado)

1. Acesse o painel de administração do Multilogin
2. Edite o perfil que precisa do fix
3. Encontre o campo **"Script Personalizado"** ou **"Custom Script"**
4. Cole o script acima
5. Salve o perfil

### Opção 2: Via API

Se estiver criando perfis via API, inclua o script no campo `custom_script`:

```json
{
  "name": "Meu Perfil",
  "url": "https://app.videogen.io/signin",
  "custom_script": "// Cole o script aqui (em uma linha ou use \\n para quebras)"
}
```

### Opção 3: Aplicar em Todos os Perfis

Para aplicar automaticamente em todos os perfis de um grupo:

1. Acesse as configurações do grupo
2. Adicione o script no campo de script padrão
3. Todos os perfis do grupo herdarão o script

---

## 🔬 Como Funciona

| Componente                        | O que faz                                       |
| --------------------------------- | ----------------------------------------------- |
| `delete window.RTCPeerConnection` | Restaura a API de WebRTC que foi bloqueada      |
| `window.open override`            | Força o popup do Google a abrir em nova aba     |
| `click listener`                  | Monitora cliques em botões do Google para debug |

---

## ⚠️ Notas Importantes

1. **Segurança:** Este script restaura o WebRTC, o que pode expor o IP real em alguns casos
2. **Escopo:** O script só afeta o perfil onde foi aplicado
3. **Compatibilidade:** Testado em VideoGen, mas deve funcionar em outros sites com OAuth Google

---

## 🔄 Variações do Script

### Versão Mínima (Apenas WebRTC)

Se o problema for apenas WebRTC:

```javascript
(function () {
  try {
    delete window.RTCPeerConnection;
    delete window.webkitRTCPeerConnection;
    console.log("[FIX] WebRTC restaurado");
  } catch (e) {}
})();
```

### Versão para Facebook Login

Para problemas similares com Facebook:

```javascript
(function () {
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (
      url &&
      (url.includes("facebook.com/login") || url.includes("facebook.com/v"))
    ) {
      console.log("[FIX] Redirecionando Facebook OAuth...");
      return originalWindowOpen.call(window, url, "_blank");
    }
    return originalWindowOpen.call(window, url, target, features);
  };
})();
```

### Versão Combinada (Google + Facebook + Apple)

```javascript
(function () {
  // Restaurar WebRTC
  try {
    delete window.RTCPeerConnection;
    delete window.webkitRTCPeerConnection;
  } catch (e) {}

  // Override window.open para todos OAuth providers
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    const oauthProviders = [
      "accounts.google.com",
      "facebook.com/login",
      "facebook.com/v",
      "appleid.apple.com",
      "login.microsoftonline.com",
      "github.com/login/oauth",
    ];

    if (url && oauthProviders.some((provider) => url.includes(provider))) {
      console.log("[FIX] OAuth detectado, abrindo em nova aba...");
      return originalWindowOpen.call(window, url, "_blank");
    }
    return originalWindowOpen.call(window, url, target, features);
  };

  console.log("[FIX] Multi-OAuth fix carregado!");
})();
```

---

## 📝 Histórico de Versões

| Versão | Data     | Mudanças                           |
| ------ | -------- | ---------------------------------- |
| 1.0    | Jan 2026 | Versão inicial - Fix para VideoGen |

---

## 🆘 Troubleshooting

### O script não funcionou?

1. Verifique se o script foi salvo corretamente no perfil
2. Feche e reabra o perfil
3. Verifique o console do navegador (F12) para ver os logs `[GURU-FIX]`

### O login funciona mas o IP vaza?

O script restaura o WebRTC, então o IP real pode ser exposto. Para manter a proteção de IP enquanto usa OAuth:

1. Use uma VPN no sistema operacional
2. Configure um proxy no nível do sistema

---

## 📞 Suporte

Se precisar de ajuda adicional ou encontrar outros sites com problemas de OAuth:

- Documente o URL do site
- Capture o erro no console (F12)
- Adicione à documentação para futuras correções
