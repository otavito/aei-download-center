const msalConfig = {
    auth: {
        clientId: "d31b3f28-a6ef-494f-aa96-07ace2b9dc5d",
        authority: "https://login.microsoftonline.com/87f6fc48-e60f-46ed-8344-73c53aed539f",
        redirectUri: window.location.origin + window.location.pathname,
        postLogoutRedirectUri: window.location.origin + window.location.pathname
    },
    cache: {
        cacheLocation: "sessionStorage"
    }
};

const loginRequest = {
    scopes: ["User.Read", "GroupMember.Read.All", "Sites.Read.All"]
};

const tokenRequest = {
    scopes: ["User.Read", "GroupMember.Read.All", "Sites.Read.All"]
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const ALLOWED_GROUP_IDS = [
    "5af94a6e-353c-4c0d-93b0-18343fcde6ec",
    "a7abb646-5d64-498a-9ad0-39513f83c793"
];
const SHAREPOINT_HOST = "munters.sharepoint.com";
const SHAREPOINT_SITE_PATH = "/sites/aeillc";
const SHAREPOINT_FOLDER_PATH = "/R&D/Software Releases";

const msalInstance = new msal.PublicClientApplication(msalConfig);

let currentAccount = null;

const loginBtn = document.getElementById("login-button");
const loginHeaderBtn = document.getElementById("login-header-button");
const logoutBtn = document.getElementById("logout-button");
const helpBtn = document.getElementById("help-button");
const loginError = document.getElementById("login-error");
const statusMessage = document.getElementById("file-operation-status");
const foldersGrid = document.getElementById("folders-grid");

function setLoginError(message = "") {
    if (!loginError) {
        return;
    }

    loginError.className = message ? "status-message error" : "status-message";
    loginError.textContent = message;
}

function setStatus(message = "", statusType = "") {
    if (!statusMessage) {
        return;
    }

    statusMessage.className = statusType ? `status-message ${statusType}` : "status-message";
    statusMessage.textContent = message;
}

function setLoadingState(message) {
    if (!foldersGrid) {
        return;
    }

    foldersGrid.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "loading-state";
    loading.textContent = message;
    foldersGrid.appendChild(loading);
}

function showAuthenticatedView() {
    document.getElementById("login-view").style.display = "none";
    document.getElementById("files-view").style.display = "block";
    document.getElementById("user-info").style.display = "flex";
    document.getElementById("login-header-button").style.display = "none";
    document.getElementById("logout-button").style.display = "inline-block";
    document.getElementById("help-button").style.display = "flex";

    const username = currentAccount.name || currentAccount.username;
    document.getElementById("username").textContent = username;

    const initials = currentAccount.name
        ? currentAccount.name.split(" ").map(part => part[0]).join("").substring(0, 2)
        : currentAccount.username.charAt(0);
    document.getElementById("user-avatar").textContent = initials.toUpperCase();
}

function showUnauthenticatedView() {
    document.getElementById("login-view").style.display = "flex";
    document.getElementById("files-view").style.display = "none";
    document.getElementById("user-info").style.display = "none";
    document.getElementById("login-header-button").style.display = "inline-block";
    document.getElementById("logout-button").style.display = "none";
    document.getElementById("help-button").style.display = "none";
}

function encodeGraphPath(path) {
    return path
        .split("/")
        .map(segment => (segment ? encodeURIComponent(segment) : ""))
        .join("/");
}

async function getToken() {
    const account = currentAccount || msalInstance.getActiveAccount();

    if (!account) {
        throw new Error("Nenhuma conta autenticada encontrada.");
    }

    try {
        const response = await msalInstance.acquireTokenSilent({ ...tokenRequest, account });
        return response.accessToken;
    } catch (error) {
        if (error instanceof msal.InteractionRequiredAuthError) {
            await msalInstance.acquireTokenRedirect({ ...tokenRequest, account });
            throw new Error("Redirecionando para renovar o token.");
        }

        throw error;
    }
}

async function fetchGraphJson(url, token) {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        const details = await response.text();
        const error = new Error(`Graph API error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.details = details;
        throw error;
    }

    return response.json();
}

async function postGraphJson(url, token, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const details = await response.text();
        const error = new Error(`Graph API error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.details = details;
        throw error;
    }

    return response.json();
}

async function fetchAllGraphItems(url, token) {
    const items = [];
    let nextUrl = url;

    while (nextUrl) {
        const payload = await fetchGraphJson(nextUrl, token);
        if (Array.isArray(payload.value)) {
            items.push(...payload.value);
        }
        nextUrl = payload["@odata.nextLink"] || null;
    }

    return items;
}

async function userIsInAllowedGroup(token) {
    const result = await postGraphJson(`${GRAPH_BASE}/me/checkMemberGroups`, token, {
        groupIds: ALLOWED_GROUP_IDS
    });

    return Array.isArray(result.value) && result.value.length > 0;
}

async function loadSharePointFolders(token) {
    const folderPath = encodeGraphPath(SHAREPOINT_FOLDER_PATH);
    const siteUrl = `${GRAPH_BASE}/sites/${SHAREPOINT_HOST}:${SHAREPOINT_SITE_PATH}:/drive/root:${folderPath}:/children?$select=name,webUrl,folder,lastModifiedDateTime&$top=999`;
    const items = await fetchAllGraphItems(siteUrl, token);

    return items
        .filter(item => item.folder)
        .map(item => ({
            name: item.name,
            webUrl: item.webUrl,
            lastModifiedDateTime: item.lastModifiedDateTime
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function renderFolders(folders) {
    if (!foldersGrid) {
        return;
    }

    foldersGrid.innerHTML = "";

    if (!folders.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.textContent = "Nenhuma pasta foi encontrada nesse caminho do SharePoint.";
        foldersGrid.appendChild(emptyState);
        return;
    }

    folders.forEach(folder => {
        const link = document.createElement("a");
        link.className = "folder-card";
        link.href = folder.webUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const icon = document.createElement("div");
        icon.className = "folder-card-icon";
        icon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
            </svg>
        `;

        const body = document.createElement("div");
        body.className = "folder-card-body";

        const title = document.createElement("h3");
        title.textContent = folder.name;

        const meta = document.createElement("p");
        meta.textContent = folder.lastModifiedDateTime
            ? `Atualizada em ${new Date(folder.lastModifiedDateTime).toLocaleString("pt-BR")}`
            : "Abrir pasta no SharePoint";

        const action = document.createElement("span");
        action.className = "folder-card-action";
        action.textContent = "Abrir pasta";

        body.appendChild(title);
        body.appendChild(meta);
        body.appendChild(action);

        link.appendChild(icon);
        link.appendChild(body);
        foldersGrid.appendChild(link);
    });
}

async function loadFoldersForCurrentUser() {
    try {
        setStatus("Verificando o grupo autorizado...", "info");
        setLoadingState("Carregando pastas do SharePoint...");

        const token = await getToken();
        const allowed = await userIsInAllowedGroup(token);

        if (!allowed) {
            setStatus("Acesso negado. O usuário não faz parte do grupo Speria Download Center.", "error");
            foldersGrid.innerHTML = "";

            const denied = document.createElement("div");
            denied.className = "empty-state error-state";
            denied.textContent = "Acesso negado para este grupo.";
            foldersGrid.appendChild(denied);
            return;
        }

        setStatus("Acesso validado. Buscando pastas no SharePoint...", "info");
        const folders = await loadSharePointFolders(token);
        renderFolders(folders);
        setStatus(`Encontradas ${folders.length} pastas no SharePoint.`, "success");
    } catch (error) {
        console.error("Erro ao carregar pastas:", error);

        if (error.status === 403) {
            setStatus("O token atual não possui permissão para ler o SharePoint. Confirme Sites.Read.All com admin consent.", "error");
        } else {
            setStatus("Erro ao carregar as pastas do SharePoint.", "error");
        }

        if (foldersGrid) {
            foldersGrid.innerHTML = "";
            const errorState = document.createElement("div");
            errorState.className = "empty-state error-state";
            errorState.textContent = "Não foi possível carregar as pastas.";
            foldersGrid.appendChild(errorState);
        }
    }
}

function bindEvents() {
    const loginHandler = () => {
        setLoginError("");
        msalInstance.loginRedirect(loginRequest).catch(error => {
            console.error("Login redirect error:", error);
            setLoginError("Não foi possível iniciar o login no Microsoft.");
        });
    };

    loginBtn.onclick = loginHandler;
    loginHeaderBtn.onclick = loginHandler;

    logoutBtn.onclick = () => {
        msalInstance.logoutRedirect({ account: currentAccount || msalInstance.getActiveAccount() || null }).catch(error => {
            console.error("Logout redirect error:", error);
        });
    };

    helpBtn.onclick = event => {
        event.preventDefault();
        window.open("https://munters-aei.zendesk.com/hc/en-us/requests/new?ticket_form_id=18575973794588", "_blank");
    };
}

async function bootstrap() {
    bindEvents();

    try {
        const redirectResponse = await msalInstance.handleRedirectPromise();

        if (redirectResponse && redirectResponse.account) {
            currentAccount = redirectResponse.account;
            msalInstance.setActiveAccount(currentAccount);
        } else {
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                currentAccount = accounts[0];
                msalInstance.setActiveAccount(currentAccount);
            }
        }

        if (currentAccount) {
            showAuthenticatedView();
            await loadFoldersForCurrentUser();
            return;
        }
    } catch (error) {
        console.error("Error during redirect handling:", error);
        setLoginError("Falha ao processar o login do Microsoft.");
    }

    showUnauthenticatedView();
}

window.addEventListener("load", bootstrap);