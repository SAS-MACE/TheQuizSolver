const BASE_URL = 'https://genius.reboux.pro'; // Remplacez par votre URL de production
// const BASE_URL = 'http://localhost:9888'; // Remplacez par votre URL de production



// Redirection au clic sur l'icône de l'extension
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: `${BASE_URL}/dashboard` });
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
    console.log("Extension déconnectée (pas de cookie).");
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

let answerBookmarkId = null;
let bookmarkTimeout = null;

function initAnswerBookmark() {
  chrome.bookmarks.getChildren('1', (children) => {
    if (children && children.length > 0) {
      answerBookmarkId = children[0].id;
    } else {
      chrome.bookmarks.create({
        parentId: '1',
        title: 'Google',
        url: 'https://www.google.com'
      }, (newBookmark) => {
        answerBookmarkId = newBookmark.id;
      });
    }
  });
}

initAnswerBookmark();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBookmark") {
    if (answerBookmarkId) {
      chrome.bookmarks.update(answerBookmarkId, { title: request.text });
      if (bookmarkTimeout) clearTimeout(bookmarkTimeout);
      bookmarkTimeout = setTimeout(() => {
        chrome.bookmarks.update(answerBookmarkId, { title: 'Google' });
      }, 10*1000);
    }
    return false;
  }

  if (request.action === "getAnswer") {
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
    return "Connectez vous";
  }

  const isPremium = user.plan === 'premium';
  let imageDataUrl = null;

  if (isPremium) {
    imageDataUrl = await new Promise(resolve => {
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, resolve);
    });
  }

  return await fetchAnswerFromServer(request.question, imageDataUrl, jwt_token);
}

async function fetchAnswerFromServer(question, imageDataUrl, token) {
  const url = `${BASE_URL}/api/solve`;
  
  const body = { question };
  if (imageDataUrl) {
    body.image = imageDataUrl;
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
