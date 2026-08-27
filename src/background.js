let BASE_URL = 'https://www.thequizsolver.com'; // Remplacez par votre URL de production
let installType='undefined'
chrome.management.getSelf((extensionInfo) => {
  installType = extensionInfo.installType;
  if (extensionInfo.installType === 'development') {
    BASE_URL = 'http://localhost:9888'; // Remplacez par votre URL de production
  }
  // save base in cache
  chrome.storage.local.set({ BASE_URL: BASE_URL });
});



// Redirection au clic sur l'icône de l'extension
chrome.action.onClicked.addListener(async () => {
  const { jwt_token } = await chrome.storage.local.get(['jwt_token']);
  if (jwt_token) {
    chrome.tabs.create({ url: `${BASE_URL}/dashboard` });
  } else {
    chrome.tabs.create({ url: `${BASE_URL}/register` });
  }
});


chrome.runtime.onInstalled.addListener((details) => {
  chrome.runtime.setUninstallURL(`${BASE_URL}/uninstall`);
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({
      url: BASE_URL + '/install'
    });

    // Fermer les onglets du Chrome Web Store pour éviter la désinstallation immédiate
    const webStoreUrls = [
      "https://chromewebstore.google.com/detail/*",
      "https://chrome.google.com/webstore/detail/*"
    ];
    chrome.tabs.query({ url: webStoreUrls }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.remove(tab.id);
      });
    });
  }
});

// Détecter les navigations SPA (changement d'URL sans rechargement)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.sendMessage(tabId, { action: "spa_navigation" }).catch(() => {
      // Ignorer l'erreur si le content script n'est pas encore injecté sur la page
    });
  }
});

// Synchronisation de l'utilisateur via le cookie du site
async function syncUser() {
  const cookie = await chrome.cookies.get({ url: BASE_URL, name: "auth_token" });

  if (cookie && cookie.value) {
    const token = cookie.value;
    try {
      const response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Sauvegarder le token et les infos (magicKey, plan, etc.)
        await chrome.storage.local.set({ 
          jwt_token: token, 
          user: data.user 
        });
        console.log("Extension synchronisée avec le compte:", data.user.email);
      } else {
        await chrome.storage.local.remove(['jwt_token', 'user']);
      }
    } catch (err) {
      console.error("Erreur de synchronisation:", err);
    }
  } else {
    // Pas de cookie, déconnecter l'extension
    await chrome.storage.local.remove(['jwt_token', 'user']);
  }
}

// Déclencheurs de synchronisation
chrome.runtime.onInstalled.addListener(syncUser);
chrome.runtime.onStartup.addListener(syncUser);

chrome.cookies.onChanged.addListener((changeInfo) => {
  const baseHost = new URL(BASE_URL).hostname;
  if (changeInfo.cookie.name === 'auth_token' && changeInfo.cookie.domain.includes(baseHost)) {
    syncUser();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // sync user on all page load
  if (changeInfo.status === 'complete') {
    syncUser();
  }
});

let answerBookmarkId = null;
let bookmarkTimeout = null;

function initAnswerBookmark() {
  const isFirefox = navigator.userAgent.includes('Firefox');
  const parentId = isFirefox ? 'toolbar_____' : '1';

  chrome.bookmarks.getChildren(parentId, (children) => {
    if (chrome.runtime.lastError) {
      console.log("Erreur lors de la récupération des favoris :", chrome.runtime.lastError);
      return;
    }
    if (children && children.length > 0) {
      answerBookmarkId = children[0].id;
    } else {
      chrome.bookmarks.create({
        parentId: parentId,
        title: 'Google',
        url: 'https://www.google.com'
      }, (newBookmark) => {
        if (chrome.runtime.lastError || !newBookmark) {
          console.error("Impossible de créer le favori :", chrome.runtime.lastError);
          return;
        }
        answerBookmarkId = newBookmark.id;
      });
    }
  });
}

initAnswerBookmark();

function updateBookmarkLocally(text, url) {
    if (answerBookmarkId) {
      const updateData = { title: text };
      if (url) {
        updateData.url = url;
      }
      chrome.bookmarks.update(answerBookmarkId, updateData);
      
      if (bookmarkTimeout) clearTimeout(bookmarkTimeout);
      bookmarkTimeout = setTimeout(() => {
        chrome.bookmarks.update(answerBookmarkId, { title: 'Google', url: 'https://www.google.com' });
      }, 10*1000);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getConfig") {
    sendResponse({ installType: installType });
    return false;
  }

  if (request.action === "updateBookmark") {
    updateBookmarkLocally(request.text, request.url);
    return false;
  }

  if (request.action === "sendPreSolve") {
    const infos = {
      ...(request.infos || {}),
      pageURL: sender.tab ? sender.tab.url : 'Unknown',
      pageTitle: sender.tab ? sender.tab.title : 'Unknown',
      extVersion: chrome.runtime.getManifest().version,
      browserLang: navigator.language,
      timestamp: Date.now()
    };
    handlePreSolveRequest(infos);
    return false;
  }

  if (request.action === "getAnswer") {
    handleAnswerRequest(request)
      .then(answer => {
        if (answer === 'disabled') {
            // Nothing to do
        } else if (typeof answer === 'object' && answer.error === "NOT_LOGGED_IN") {
            updateBookmarkLocally(answer.message, answer.message);
            chrome.tabs.create({ url: answer.message + "/register" });
        } else {
            updateBookmarkLocally(answer);
        }
        sendResponse({ answer });
      })
      .catch(e => {
        console.log(e);
        updateBookmarkLocally("❌");
        sendResponse({ answer: "Erreur" });
      });
    return true;
  }
});

async function handlePreSolveRequest(infos) {
  const { jwt_token, user } = await chrome.storage.local.get(['jwt_token', 'user']);
  if (!jwt_token || !user) return;
  
  try {
    await fetch(`${BASE_URL}/api/presolve`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt_token}`
      },
      body: JSON.stringify({ infos })
    });
  } catch (err) {
    console.error("Erreur serveur presolve:", err);
  }
}

async function handleAnswerRequest(request) {
  const { jwt_token, user } = await chrome.storage.local.get(['jwt_token', 'user']);
  
  if (!jwt_token || !user) {
    return { error: "NOT_LOGGED_IN", message: BASE_URL };
  }

  const isDblClick = request.infos && request.infos.eventFrom === 'dblclick';
  if (!(user.disableDoubleClick === 1 && isDblClick)) {
      updateBookmarkLocally("⏳");
  }

  const isPremium = user.plan === 'premium';
  let imageDataUrl = null;

  if (isPremium) {
    imageDataUrl = await new Promise(resolve => {
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, resolve);
    });
  }

  return await fetchAnswerFromServer(request, imageDataUrl, jwt_token);
}

function simplifyPageText(pageText){
  let prevText = "";
  while(prevText !== pageText){
    prevText = pageText;
    pageText = pageText.replace(/\n\n/g, '\n').replace(/  /g, ' ').replace(/, /g, ',').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ - /g, '-').replace(/: /g, ':').replace(/ \:/g, ':').replace(/ ; /g, ';')
  }
  return pageText.substring(0, 500);
}

async function fetchAnswerFromServer(request, imageDataUrl, token) {
  const url = `${BASE_URL}/api/solve`;
  
  const body = { question: request.question };
  if (imageDataUrl) {
    body.image = imageDataUrl;
  }
  if (request.pageText) {
    body.pageText = simplifyPageText(request.pageText);
  }

  if(request.infos){
    body.infos = request.infos;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    }); 

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const data = await response.json();
        if(data.error){
          return data.error;
        }else{
          return response.status.toString()
        }
          
      }
      return `Erreur API: ${response.status}`;
    }

    const data = await response.json();
    return data.answer || "Aucune réponse trouvée";
  } catch (err) {
    console.error("Erreur serveur:", err);
    return "Serveur indisponible";
  }
}
