# 🚀 Como Usar GitHub Actions para Build Multi-Plataforma

## O que é?

GitHub Actions roda **máquinas virtuais gratuitas** de Windows, Mac e Linux que compilam seu app automaticamente.

---

## 📋 Passo a Passo

### 1️⃣ Criar Repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Nome: `ferramentas-guru` (ou outro)
3. **Privado** ✅ (importante!)
4. Clique "Create repository"

### 2️⃣ Subir o Código

No terminal, dentro da pasta do projeto:

```bash
cd "c:\Users\euaug\Downloads\MEU MULTILOGIN\MEU MULTILOGIN\launcher"

# Inicializar Git (se ainda não tiver)
git init

# Adicionar arquivos
git add .
git commit -m "Versão 1.0.0 com auto-update"

# Conectar ao GitHub (substitua pelo seu usuário)
git remote add origin https://github.com/SEU_USUARIO/ferramentas-guru.git
git branch -M main
git push -u origin main
```

### 3️⃣ Executar o Build

**Opção A - Manual (mais fácil):**

1. Vá no seu repositório no GitHub
2. Clique na aba **"Actions"**
3. Clique em **"Build Installers"** na esquerda
4. Clique **"Run workflow"** → **"Run workflow"**
5. Aguarde ~10-15 minutos

**Opção B - Por tag de versão:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

O build inicia automaticamente!

### 4️⃣ Baixar os Instaladores

1. Após o build terminar (ícone verde ✅)
2. Clique no workflow que rodou
3. Role para baixo até **"Artifacts"**
4. Baixe:
   - `Ferramentas-Guru-Setup-Windows` (Windows)
   - `Ferramentas-Guru-macOS` (Mac)
   - `Ferramentas-Guru-Linux` (Linux)

---

## ⏱️ Tempo de Build

| Plataforma | Tempo médio |
| ---------- | ----------- |
| Windows    | ~5 min      |
| macOS      | ~8 min      |
| Linux      | ~4 min      |
| **Total**  | ~10-15 min  |

---

## 💰 Custos

GitHub Actions é **GRATUITO** para repositórios privados:

- **2.000 minutos/mês** grátis
- Cada build gasta ~15 min
- Dá pra fazer **~130 builds/mês** de graça!

---

## 📁 Estrutura de Arquivos

O workflow está em:

```
launcher/.github/workflows/build.yml
```

---

## 🔄 Fluxo Completo de Release

1. Altere a versão no `package.json`
2. Commit e push
3. Crie uma tag: `git tag v1.0.1 && git push origin v1.0.1`
4. Aguarde o build (~15 min)
5. Baixe os instaladores
6. Suba para seu servidor
7. Atualize o `latest.json`

**Pronto! Todos os usuários receberão a atualização automaticamente!**
