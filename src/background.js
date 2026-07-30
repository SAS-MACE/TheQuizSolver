let answerBookmarkId = null;
let bookmarkTimeout = null;

function initAnswerBookmark() {
  chrome.bookmarks.getChildren('1', (children) => {
    if (children && children.length > 0) {
      // On prend le tout premier favori de la barre
      answerBookmarkId = children[0].id;
    } else {
      // S'il n'y a aucun favori, on en crée un
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
  const imageDataUrl = await new Promise(resolve => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, resolve);
  });
  return await fetchAnswerFromGemini(request.question, imageDataUrl);
}

async function fetchAnswerFromGemini(question, imageDataUrl) {
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  if (!geminiApiKey) return "Clé API manquante";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;
  const promptText = `Réponds très brièvement à cette question de quiz. Donne uniquement la réponse courte, sans aucune explication supplémentaire, pour que ça tienne dans le nom d'un favori de navigateur: ${question || ''}`;
  const base64Data = imageDataUrl.split(',')[1];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    })
  });

  if (!response.ok) throw new Error(`Erreur API: ${response.status}`);

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Aucune réponse trouvée";
}
