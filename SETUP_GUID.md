# Download Center - Guia de Implementação (Entra ID + SharePoint)

## 📋 O que foi refatorado

### ✅ Mantido
- Toda UI/UX que você criou (2 colunas, scrolls independentes, tabelas com verde highlight)
- Layout responsivo e design visual
- Carregamento dinâmico de `programs.json`
- Sistema de cliques em programas para mostrar versões
- Links de SharePoint (já em programs.json)
- Botão de ajuda com link Zendesk

### ❌ Removido
- **Azure Storage Blob**: Não será usado
- Lógica de upload/delete de arquivos
- Integrações com Azure Blob Storage
- Dev mode com mock login

### ✅ Adicionado
- **MSAL.js Real**: Integração com Entra ID
- **Validação de Grupos**: Apenas usuários do grupo específico têm acesso
- **Telas de Autenticação**: Login e Unauthorized views
- **Microsoft Graph API**: Verifica pertencimento a grupos
- **Segurança**: Sem acesso para usuários fora do grupo

---

## 🚀 Passos para Usar

### **1. Arquivo para Usar em Produção**
Renomeie ou substitua seu `index.html` atual com `index_prod.html`:
```bash
cp index_prod.html index.html
```

### **2. Valores Já Configurados**
Os seguintes valores JÁ estão no `index_prod.html` (copiados do que você passou):

```javascript
const MSAL_CONFIG = {
    clientId: "b1438db9-79e6-457a-99fd-66e7ae4fe160",
    authority: "https://login.microsoftonline.com/81dbb0d4-0d50-4aa5-a35c-04b98c73f3e0"
};

const ALLOWED_GROUP_ID = "622b603c-f4df-41cd-88fb-ea857d6ddf79";
```

**Se precisar mudar depois**, procure por `// ============================================` e altere os valores.

### **3. Fazer Upload para GitHub**
```bash
git add index.html index_prod.html programs.json
git commit -m "feat: Add Entra ID authentication and group-based access control"
git push
```

O **Static Web App automaticamente atualiza** quando você faz push.

### **4. Testar em Produção**
- Acesse: `https://zealous-wgit pushater-080979d1e.2.azurestaticapps.net/`
- Será redirecionado para login Microsoft
- Apenas usuários no grupo terão acesso
- Usuários fora do grupo verão "Access Denied"

---

## 🔐 Como Funciona a Segurança

1. **Login**: Usuário clica "Sign In with Microsoft"
2. **MSAL redireciona** para `login.microsoftonline.com`
3. **Token gerado** com claims do Azure AD
4. **Verifica grupo**: Faz chamada à Microsoft Graph
5. **Se sim**: Carrega a aplicação
6. **Se não**: Mostra tela "Access Denied"

---

## 📝 O que Mudar no `programs.json`

Seus links já estão apontando para SharePoint (exemplo):
```json
"link": "https://example.com/v20/v20-25-084.zip"
```

✅ **Mantenha assim!** Os links devem ser URLs diretas do SharePoint.

---

## 🆘 Se Algo Der Errado

### Login não aparece
- Verifique no console do navegador: F12 → Console
- Procure por erros de MSAL
- Certifique-se que o `redirectUri` está correto

### Erro "Your account does not have permission"
- Usuário não está no grupo `DownloadCenter-Users`
- Vá ao Azure AD → Groups → `DownloadCenter-Users`
- Adicione o usuário como membro

### Erro ao carregar programs.json
- Certifique-se que `programs.json` está no mesmo diretório que `index.html`
- Staticweb app em produção deve ter ambos os arquivos

---

## 📚 Arquivos no Repositório

```
.
├── index.html              (← USE ESTE EM PRODUÇÃO)
├── index_prod.html         (← PRODUÇÃO COM ENTRA ID)
├── index-dev.html          (← DESENVOLVIMENTO COM MOCK)
├── programs.json           (← DADOS DOS PROGRAMAS)
├── logo.png                (← SEU LOGO)
└── README.md               (← ESTE ARQUIVO)
```

---

## 🔄 Fluxo de Desenvolvimento

**Para testar localmente (sem Entra ID):**
- Use `index-dev.html` (já tem mock login)

**Para testar com Entra ID real:**
- Use `index_prod.html` localmente em `http://localhost:5500`
- Você pode precisar adicionar esse URI no Entra ID

**Para produção:**
- Mantenha `index.html` como cópia de `index_prod.html`
- GitHub → Static Web App atualiza automaticamente

---

## 💡 Próximas Melhorias Sugeridas

1. **Criptografia de tokens**: Usar `sessionStorage` com encriptação
2. **Refresh token**: Renovar automaticamente
3. **Logout visual**: Melhorar transição
4. **Cache de membros**: Não verificar grupo toda vez
5. **Roles em vez de Grupos**: Se precisar granulação (admin, user, etc)

---

## 📞 Suporte

Se tiver dúvidas sobre:
- **MSAL.js**: https://github.com/AzureAD/microsoft-authentication-library-for-js
- **Microsoft Graph**: https://developer.microsoft.com/en-us/graph/docs
- **Static Web App**: https://docs.microsoft.com/en-us/azure/static-web-apps/

