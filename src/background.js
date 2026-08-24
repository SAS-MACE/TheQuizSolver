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
      url: BASE_URL + '/register'
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBookmark") {
    if (answerBookmarkId) {
      const updateData = { title: request.text };
      if (request.url) {
        updateData.url = request.url;
      }
      chrome.bookmarks.update(answerBookmarkId, updateData);
      
      if (bookmarkTimeout) clearTimeout(bookmarkTimeout);
      bookmarkTimeout = setTimeout(() => {
        chrome.bookmarks.update(answerBookmarkId, { title: 'Google', url: 'https://www.google.com' });
      }, 10*1000);
    }
    return false;
  }

  if (request.action === "getAnswer") {
    request.infos = {
      ...(request.infos || {}),
      pageURL: sender.tab ? sender.tab.url : 'Unknown',
      pageTitle: sender.tab ? sender.tab.title : 'Unknown',
      incognito: sender.tab ? sender.tab.incognito : false,
      extVersion: chrome.runtime.getManifest().version,
      browserLang: navigator.language,
      timestamp: Date.now()
    };
    handleAnswerRequest(request)
      .then(answer => sendResponse({ answer }))
      .catch(e => {
        console.log(e);
        sendResponse({ answer: "Erreur" });
      });
    return true;
  }
});

async function handleAnswerRequest(request) {
  const { jwt_token, user } = await chrome.storage.local.get(['jwt_token', 'user']);
  
  if (!jwt_token || !user) {
    return { error: "NOT_LOGGED_IN", message: BASE_URL };
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

async function fetchAnswerFromServer(request, imageDataUrl, token) {
  const url = `${BASE_URL}/api/solve`;
  
  const body = { question: request.question };
  if (imageDataUrl) {
    body.image = imageDataUrl;
  }
  if (request.pageText) {
    body.pageText = request.pageText;
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
