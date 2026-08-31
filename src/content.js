let magicKey = ';'; // Default
let debug = false;
chrome.runtime.sendMessage({ action: "getConfig" }, (response) => {
    if (response && response.installType === 'development') {
        debug = true;
    }
});

if (window.location.hostname.includes('thequizsolver.com') || window.location.hostname.includes('localhost')) {
    document.documentElement.setAttribute('data-extension-installed', 'true');
    window.dispatchEvent(new CustomEvent('TQS_ExtensionActive'));
}
// Initial load
chrome.storage.local.get(['user'], (data) => {
  if (data.user && data.user.magicKey) {
    magicKey = data.user.magicKey;
  }
});

// Listen for updates from storage directly (syncing from website)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.user && changes.user.newValue) {
    if (changes.user.newValue.magicKey) {
      magicKey = changes.user.newValue.magicKey;
    }
  }
});

async function executePreSolve() {
  try {
    const data = await chrome.storage.local.get(['user']);
    if (data && data.user && (data.user.preSolveEnabled === 1 || data.user.preSolveEnabled === true)) {
      let debugText = document.documentElement.innerText || "";
      if (debugText.length > 100000) {
        debugText = debugText.substring(0, 100000);
      }
      chrome.runtime.sendMessage({
        action: "sendPreSolve",
        infos: {
          debugText: debugText
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}

window.addEventListener('load', () => {
  setTimeout(executePreSolve, 2000);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "spa_navigation") {
    setTimeout(executePreSolve, 1500); // 1.5s delay for SPA to render
  }
});


function logDebug(...message){
  if (debug) console.log("[DEBUG] ", ...message)
}

window.addEventListener('keydown', (event) => {
  if (!event.isTrusted) return;
  let highlightedText = window.getSelection().toString()
  if (event.key === magicKey && highlightedText.length > 0) {
    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: highlightedText,
      infos: {
        eventFrom: "magicKey"
      }
    }, (response) => {
      // Background script handles displaying answer and redirects
    });
  }
}, { capture: true });


window.addEventListener('dblclick', (event) => {
  logDebug("Double click detected", event.target)
  chrome.storage.local.get(['user'], (result) => {

    let elementText = event.target.value || event.target.innerText || event.target.textContent || "";
    
    const disabledChild = event.target.querySelectorAll('input[disabled], textarea[disabled]');
    disabledChild.forEach(element => {
      elementText+= element.value || "";
    });
    
    elementText = elementText.trim();

    if (elementText.length > 0) {
    chrome.runtime.sendMessage({
      action: "getAnswer",
      question: elementText,
      infos: {
        eventFrom: "dblclick"
      },
      pageText: getContextText(event.target)
    }, (response) => {
      if (response && response.answer) {
        if (response.answer === "disabled") {
            return;
        }
        if (typeof response.answer === 'object' && response.answer.error === "NOT_LOGGED_IN") {
          // Background script handles redirect
        } else {
          executeBestAction(response.answer, event.target);
        }
      }
    });
  }
  });
}, { capture: true });

function clickProxy(element, debugText=""){
  logDebug("Clicking on :", element, debugText);
  
  function triggerEvents(el) {
    if (!el) return;
    const events = ['pointerdown', 'mousedown', 'mouseup', 'click', 'change'];
    events.forEach(eventType => {
      try {
        let event;
        if (eventType === 'change') {
            event = new Event(eventType, { bubbles: true });
        } else {
            event = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            });
        }
        el.dispatchEvent(event);
      } catch (e) { }
    });
  }

  let originalText = (element.innerText || element.textContent || "").trim();

  // 1. Descendre vers l'enfant le plus profond ayant exactement le même texte
  let target = element;
  if (originalText) {
    while (target.children.length > 0) {
      let found = false;
      for (let i = 0; i < target.children.length; i++) {
        let child = target.children[i];
        let childText = (child.innerText || child.textContent || "").trim();
        if (childText === originalText) {
          target = child;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
  }

  // 2. Cliquer et remonter tant que le texte est identique
  let current = target;
  let safetyCounter = 0;
  while (current && safetyCounter < 10) { // Limite de sécurité
    triggerEvents(current);
    
    let parent = current.parentElement;
    if (!parent || !originalText) break;
    
    let parentText = (parent.innerText || parent.textContent || "").trim();
    if (parentText !== originalText) {
      // Le parent contient d'autres textes (ex: d'autres réponses), on arrête de remonter
      break;
    }
    current = parent;
    safetyCounter++;
  }
}

function getPathWithSemanticDistances(node) {
  let pathMap = new Map();
  let curr = node;
  let dist = 0;
  let prevText = (curr.innerText || curr.textContent || "").trim();

  while (curr) {
    pathMap.set(curr, dist);
    let nextParent = curr.parentNode;
    if (nextParent) {
      let parentText = (nextParent.innerText || nextParent.textContent || "").trim();
      if (parentText !== prevText) {
        dist++;
        prevText = parentText;
      }
    }
    curr = nextParent;
  }
  return pathMap;
}

function getDomDistance(path1Map, node2) {
  if (!path1Map || !node2) return Infinity;
  try {
    let path2Map = getPathWithSemanticDistances(node2);
    
    for (let [node, dist1] of path1Map) {
      if (path2Map.has(node)) {
        let dist2 = path2Map.get(node);
        return dist1 + dist2;
      }
    }
    return Infinity;
  } catch(e) {
    return Infinity;
  }
}

function getTextDistance(node1, node2) {
  if (!node1 || !node2) return Infinity;
  try {
    const range = document.createRange();
    const pos = node1.compareDocumentPosition(node2);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      range.setStartBefore(node1);
      range.setEndAfter(node2);
    } else if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
      range.setStartBefore(node2);
      range.setEndAfter(node1);
    } else {
      range.selectNode(node1.contains(node2) ? node1 : node2);
    }
    return range.toString().trim().length;
  } catch(e) {
    return Infinity;
  }
}

function executeBestAction(answerText, questionElement) {
  if (!answerText) return false;
  
  let cleanAnswer = answerText.trim().toLowerCase();
  let superCleanAnswer = cleanAnswer.replace(/\s+/g, '');
  const allElements = Array.from(document.querySelectorAll('*'));
  const inputSelectors = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';
  
  const candidates = [];
  
  for (let i = 0; i < allElements.length; i++) {
    let el = allElements[i];
    
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'head' || tag === 'meta' || tag === 'link' || tag === 'title') continue;
    if (tag === 'input' && el.type && el.type.toLowerCase() === 'hidden') continue;
    if (el.closest('a')) continue; // Ne jamais cliquer sur un lien ou un élément à l'intérieur d'un lien

    // Règle de structure : on ne clique pas sur l'élément cliqué ni sur ses parents
    if (questionElement && el.contains(questionElement)) continue;
    
    // 1. Vérifier si c'est un input vide
    if (el.matches && el.matches(inputSelectors)) {
      if (!el.value || el.value.trim() === '') {
        candidates.push({ type: 'input', el: el, priority: 3 });
        continue; // Un input vide ne sera pas une "réponse cliquable"
      }
    }
    
    // 2. Vérifier si c'est une correspondance de texte
    let text = el.value || el.innerText || el.textContent || "";
    let cleanText = text.trim().toLowerCase();
    
    if (cleanText.length > 0 && cleanText.length < 80) {
      let superCleanText = cleanText.replace(/\s+/g, '');
      if (superCleanText === superCleanAnswer) {
        candidates.push({ type: 'exact_match', el: el, priority: 1 });
      } else if (superCleanAnswer.length >= 3 && (superCleanText.includes(superCleanAnswer) || (superCleanAnswer.includes(superCleanText) && superCleanText.length > 1))) {
        candidates.push({ type: 'partial_match', el: el, priority: 2 });
      }
    }
  }
  
  if (candidates.length === 0) return false;
  
  // 3. Calculer les distances de façon fainéante (uniquement pour les candidats)
  let questionPathMap = questionElement ? getPathWithSemanticDistances(questionElement) : new Map();
  for (let candidate of candidates) {
    candidate.distance = questionElement ? getDomDistance(questionPathMap, candidate.el) : 0;
    candidate.textDistance = questionElement ? getTextDistance(questionElement, candidate.el) : 0;
  }
  
  // Trier par priorité d'abord, puis par distance DOM, puis textDistance en cas d'égalité
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.textDistance - b.textDistance;
  });
  
  // Promotion dynamique : si un input est physiquement plus proche que le meilleur texte, il gagne
  let bestTextCandidate = candidates.find(c => c.type !== 'input');
  let bestInputCandidate = candidates.find(c => c.type === 'input');
  
  if (bestTextCandidate && bestInputCandidate && (bestInputCandidate.distance < bestTextCandidate.distance || (bestInputCandidate.distance === bestTextCandidate.distance && bestInputCandidate.textDistance < bestTextCandidate.textDistance))) {
    bestInputCandidate.priority = 0; // Priorité absolue
    // Retri pour appliquer la promotion
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.textDistance - b.textDistance;
    });
  }
  
  const clickedElements = [];
  const clickedTexts = [];
  let bestPriority = candidates[0].priority;
  let actionsTaken = 0;
  
  for (let i = 0; i < candidates.length; i++) {
    let candidate = candidates[i];
    
    // On ne traite que les candidats qui partagent la meilleure priorité
    if (candidate.priority > bestPriority) break;
    
    if (candidate.type === 'input') {
      if (actionsTaken === 0) {
        logDebug("Filling input with :", answerText, candidate.el);
        candidate.el.value = answerText;
        candidate.el.dispatchEvent(new Event('input', { bubbles: true }));
        candidate.el.dispatchEvent(new Event('change', { bubbles: true }));
        actionsTaken++;
        return true;
      }
      continue;
    }
    
    // Vérifier les chevauchements DOM pour ne pas double-cliquer
    let overlapping = false;
    for (let clicked of clickedElements) {
      if (clicked.contains(candidate.el) || candidate.el.contains(clicked)) {
        overlapping = true;
        break;
      }
    }
    
    // Vérifier si on a déjà cliqué sur ce texte précis
    let alreadyClickedText = false;
    let cleanCandidateText = (candidate.el.innerText || candidate.el.textContent || "").trim().toLowerCase();
    for (let text of clickedTexts) {
      if (text === cleanCandidateText && cleanCandidateText !== "") {
        alreadyClickedText = true;
        break;
      }
    }
    
    if (!overlapping && !alreadyClickedText) {
      clickProxy(candidate.el, candidate.type);
      clickedElements.push(candidate.el);
      if (cleanCandidateText) {
        clickedTexts.push(cleanCandidateText);
      }
      actionsTaken++;
      
      // Si la réponse était un exact match complet, on s'arrête (un seul clic)
      if (candidate.priority === 1) {
        break;
      }
    }
  }
  
  return actionsTaken > 0;
}

function getContextText(element) {
  const charsBefore = 150;
  const charsAfter = 350;

  const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
          acceptNode: function(node) {
              const tag = node.parentNode ? node.parentNode.tagName.toLowerCase() : '';
              if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT;
              if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
              return NodeFilter.FILTER_ACCEPT;
          }
      }
  );

  walker.currentNode = element;
  
  let textBefore = "";
  let prevNode;
  
  // Lecture en arrière
  while ((prevNode = walker.previousNode()) && textBefore.length < charsBefore) {
      textBefore = prevNode.nodeValue.trim() + " " + textBefore;
  }

  // On repositionne pour lire en avant (incluant l'élément lui-même)
  walker.currentNode = element;
  let textAfter = "";
  let nextNode;
  
  // Lecture en avant
  while ((nextNode = walker.nextNode()) && textAfter.length < charsAfter) {
      textAfter += nextNode.nodeValue.trim() + " ";
  }

  // On coupe proprement si on dépasse et on nettoie les espaces
  let finalBefore = textBefore.slice(-charsBefore);
  let finalAfter = textAfter.substring(0, charsAfter);
  
  return (finalBefore + " " + finalAfter).replace(/\s+/g, ' ').trim();
}
