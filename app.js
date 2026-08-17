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
    scopes: ["User.Read", "Sites.Read.All"]
};

const tokenRequest = {
    scopes: ["User.Read", "Sites.Read.All"]
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DRIVE_ID = "b!SA8vmOt-pkCP3QW3hOWnJjUxRieT2MZHgYNHlG4pkimr8BuGOTTbTbrQU7ICK3Nv";
const SHAREPOINT_FOLDER_PATH = "/R&D/Software Releases";
const PROGRAM_FOLDERS = {
    integra: {
        path: SHAREPOINT_FOLDER_PATH,
        excludedNames: ["Config", "IntraE"],
        releaseNotesFileName: "Integra.md",
        label: "Integra"
    },
    intrae: {
        path: `${SHAREPOINT_FOLDER_PATH}/IntraE`,
        releaseNotesFileName: "IntraE.md",
        label: "IntraE"
    },
    config: {
        path: `${SHAREPOINT_FOLDER_PATH}/Config`,
        releaseNotesFileName: "Config.md",
        label: "Config"
    }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

let currentAccount = null;

const loginBtn = document.getElementById("login-button");
const loginHeaderBtn = document.getElementById("login-header-button");
const logoutBtn = document.getElementById("logout-button");
const helpBtn = document.getElementById("help-button");
const loginError = document.getElementById("login-error");
const statusMessage = document.getElementById("file-operation-status");
const foldersGrid = document.getElementById("folders-grid");
const programFilter = document.getElementById("program-filter");
const releaseNotesButton = document.getElementById("view-release-notes-button");
const releaseNotesModal = document.getElementById("release-notes-modal");
const releaseNotesTitle = document.getElementById("release-notes-title");
const releaseNotesContent = document.getElementById("release-notes-content");
const releaseNotesCloseButton = document.getElementById("release-notes-close-button");

function getProgramConfig(program) {
    return PROGRAM_FOLDERS[program] || PROGRAM_FOLDERS.integra;
}

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
    closeReleaseNotesModal();
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

async function fetchGraphText(url, token) {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/plain"
        }
    });

    if (!response.ok) {
        const details = await response.text();
        const error = new Error(`Graph API error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.details = details;
        throw error;
    }

    return response.text();
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

function parseVersion(name) {
    const normalizedName = name.replace(/^_?Version\s+/i, "").replace(/^_/, "").trim();

    if (!/^\d+(?:\.\d+)*$/.test(normalizedName)) {
        return null;
    }

    return normalizedName.split(".").map(Number);
}

function compareVersions(left, right) {
    const leftVersion = parseVersion(left.name);
    const rightVersion = parseVersion(right.name);

    if (!leftVersion && !rightVersion) {
        return left.name.localeCompare(right.name, "pt-BR");
    }

    if (!leftVersion) {
        return 1;
    }

    if (!rightVersion) {
        return -1;
    }

    const segmentCount = Math.max(leftVersion.length, rightVersion.length);
    for (let index = 0; index < segmentCount; index += 1) {
        const difference = (leftVersion[index] || 0) - (rightVersion[index] || 0);
        if (difference !== 0) {
            return difference;
        }
    }

    return left.name.localeCompare(right.name, "pt-BR");
}

async function loadSharePointFolders(token, program = "integra") {
    const programFolder = getProgramConfig(program);
    const excludedNames = new Set(programFolder.excludedNames || []);
    const folderPath = encodeGraphPath(programFolder.path);
    const driveUrl = `${GRAPH_BASE}/drives/${DRIVE_ID}/root:${folderPath}:/children?$select=name,webUrl,folder,lastModifiedDateTime&$top=999`;
    const items = await fetchAllGraphItems(driveUrl, token);

    return items
        .filter(item => item.folder && !excludedNames.has(item.name))
        .map(item => ({
            name: item.name,
            webUrl: item.webUrl,
            lastModifiedDateTime: item.lastModifiedDateTime
        }))
        .sort(compareVersions);
}

async function loadReleaseNotesFile(token, program = "integra") {
    const programFolder = getProgramConfig(program);
    const folderPath = encodeGraphPath(programFolder.path);
    const driveUrl = `${GRAPH_BASE}/drives/${DRIVE_ID}/root:${folderPath}:/children?$select=id,name,file&$top=999`;
    const items = await fetchAllGraphItems(driveUrl, token);

    const markdownFiles = items.filter(item => item.file && /\.md$/i.test(item.name));
    if (!markdownFiles.length) {
        throw new Error("Nenhum arquivo .md encontrado para o programa selecionado.");
    }

    const preferredName = (programFolder.releaseNotesFileName || "").toLowerCase();
    const selectedFile = markdownFiles.find(item => item.name.toLowerCase() === preferredName)
        || [...markdownFiles].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))[0];

    return selectedFile;
}

async function loadReleaseNotesContent(token, fileId) {
    const contentUrl = `${GRAPH_BASE}/drives/${DRIVE_ID}/items/${fileId}/content`;
    return fetchGraphText(contentUrl, token);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function parseInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
}

function markdownToHtml(markdownText) {
    const text = markdownText || "";
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const htmlParts = [];
    let index = 0;
    let inCodeBlock = false;
    let codeLines = [];
    let listType = null;

    function closeListIfOpen() {
        if (listType) {
            htmlParts.push(listType === "ol" ? "</ol>" : "</ul>");
            listType = null;
        }
    }

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
            closeListIfOpen();
            if (inCodeBlock) {
                htmlParts.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            index += 1;
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            index += 1;
            continue;
        }

        if (!trimmed) {
            closeListIfOpen();
            index += 1;
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            closeListIfOpen();
            const level = headingMatch[1].length;
            htmlParts.push(`<h${level}>${parseInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
            index += 1;
            continue;
        }

        const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
        if (unorderedMatch) {
            if (listType !== "ul") {
                closeListIfOpen();
                htmlParts.push("<ul>");
                listType = "ul";
            }
            htmlParts.push(`<li>${parseInlineMarkdown(unorderedMatch[1].trim())}</li>`);
            index += 1;
            continue;
        }

        const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (orderedMatch) {
            if (listType !== "ol") {
                closeListIfOpen();
                htmlParts.push("<ol>");
                listType = "ol";
            }
            htmlParts.push(`<li>${parseInlineMarkdown(orderedMatch[1].trim())}</li>`);
            index += 1;
            continue;
        }

        closeListIfOpen();
        const paragraphLines = [line];
        index += 1;
        while (index < lines.length) {
            const nextLine = lines[index];
            const nextTrimmed = nextLine.trim();
            if (!nextTrimmed || /^#{1,6}\s+/.test(nextLine) || /^\s*[-*+]\s+/.test(nextLine) || /^\s*\d+\.\s+/.test(nextLine) || nextTrimmed.startsWith("```")) {
                break;
            }
            paragraphLines.push(nextLine);
            index += 1;
        }
        htmlParts.push(`<p>${parseInlineMarkdown(paragraphLines.join(" ").trim())}</p>`);
    }

    if (inCodeBlock) {
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }

    closeListIfOpen();
    return htmlParts.join("");
}

function openReleaseNotesModal() {
    if (!releaseNotesModal) {
        return;
    }

    releaseNotesModal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeReleaseNotesModal() {
    if (!releaseNotesModal) {
        return;
    }

    releaseNotesModal.hidden = true;
    document.body.classList.remove("modal-open");
}

async function handleViewReleaseNotes() {
    if (!releaseNotesButton || !programFilter || !releaseNotesTitle || !releaseNotesContent) {
        return;
    }

    const defaultLabel = "View Release Notes";
    try {
        const selectedProgram = programFilter.value || "integra";
        const programFolder = getProgramConfig(selectedProgram);

        releaseNotesButton.disabled = true;
        releaseNotesButton.textContent = "Loading release notes...";
        releaseNotesTitle.textContent = `Release Notes - ${programFolder.label}`;
        releaseNotesContent.innerHTML = "<p>Loading release notes...</p>";
        openReleaseNotesModal();

        const token = await getToken();
        const releaseNotesFile = await loadReleaseNotesFile(token, selectedProgram);
        const releaseNotesText = await loadReleaseNotesContent(token, releaseNotesFile.id);

        releaseNotesContent.innerHTML = releaseNotesText
            ? markdownToHtml(releaseNotesText)
            : "<p>Release notes file is empty.</p>";
    } catch (error) {
        console.error("Erro ao carregar release notes:", error);
        setStatus("Não foi possível carregar o arquivo de release notes.", "error");
        if (releaseNotesContent) {
            releaseNotesContent.innerHTML = "<p>Could not load release notes for this program.</p>";
        }
    } finally {
        releaseNotesButton.disabled = false;
        releaseNotesButton.textContent = defaultLabel;
    }
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

    const versionedFolders = folders.filter(folder => parseVersion(folder.name));
    const latestVersion = versionedFolders.at(-1);
    const foldersForDisplay = [
        ...versionedFolders.reverse(),
        ...folders.filter(folder => !parseVersion(folder.name))
    ];

    foldersForDisplay.forEach(folder => {
        const link = document.createElement("a");
        link.className = folder === latestVersion ? "folder-card latest-version-card" : "folder-card";
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

        if (folder === latestVersion) {
            const latestLabel = document.createElement("span");
            latestLabel.className = "latest-version-label";
            latestLabel.textContent = "Latest version";
            body.appendChild(latestLabel);
        }

        const meta = document.createElement("p");
        meta.textContent = folder.lastModifiedDateTime
            ? `Last updated ${new Date(folder.lastModifiedDateTime).toLocaleString("en-US")}`
            : "Open in SharePoint";

        const action = document.createElement("span");
        action.className = "folder-card-action";
        action.textContent = "Open folder";

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
        setLoadingState("Carregando pastas do SharePoint...");

        const token = await getToken();
        setStatus("Buscando pastas no SharePoint...", "info");
        const selectedProgram = programFilter ? programFilter.value : "integra";
        const folders = await loadSharePointFolders(token, selectedProgram);
        renderFolders(folders);
    } catch (error) {
        console.error("Erro ao carregar pastas:", error);

        if (error.status === 403) {
            setStatus("Acesso negado no SharePoint. Sua conta não possui permissão para esta biblioteca/pasta.", "error");
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

    programFilter.onchange = () => {
        loadFoldersForCurrentUser();
    };

    if (releaseNotesButton) {
        releaseNotesButton.onclick = () => {
            handleViewReleaseNotes();
        };
    }

    if (releaseNotesCloseButton) {
        releaseNotesCloseButton.onclick = () => {
            closeReleaseNotesModal();
        };
    }

    if (releaseNotesModal) {
        releaseNotesModal.onclick = event => {
            if (event.target === releaseNotesModal) {
                closeReleaseNotesModal();
            }
        };
    }

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && releaseNotesModal && !releaseNotesModal.hidden) {
            closeReleaseNotesModal();
        }
    });

    closeReleaseNotesModal();
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