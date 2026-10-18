if (window.tqsExtensionInjected) {
  // Script déjà injecté, on s'arrête
} else {
  window.tqsExtensionInjected = true;

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
        if (response.answer === "disabled" || response.answer === "9898") {
            return;
        }
        if (typeof response.answer === 'object' && response.answer.error === "NOT_LOGGED_IN") {
          // Background script handles redirect
        } else if ((typeof response.answer === 'object' && response.answer.error === "EMAIL_NOT_VERIFIED") || response.answer === "EMAIL_NOT_VERIFIED") {
          // Background script handles redirect
          return;
        } else {

          let success = executeBestAction(response.answer, event.target);
          if (!success) {
            probeForDropdown(response.answer, event.target);
          }
          // setTimeout(() => executeBestAction(response.answer, event.target), 100);
          // setTimeout(() => executeBestAction(response.answer, event.target), 200);
        }
      }
    });
  }
  });
}, { capture: true });

function clickProxy(element, type=""){
  logDebug("Clicking on :", element, type);
  
  if (element.tagName && element.tagName.toLowerCase() === 'option') {
      let select = element.closest('select');
      if (select) {
          select.value = element.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          return;
      }
  }
  
  function triggerEvents(el) {
    if (!el) return;
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'change'];
    events.forEach(eventType => {
      try {
        let event;
        if (eventType === 'change') {
            event = new Event(eventType, { bubbles: true });
        } else if (eventType.startsWith('pointer') && typeof PointerEvent !== 'undefined') {
            event = new PointerEvent(eventType, { bubbles: true, cancelable: true, view: window, buttons: 1 });
        } else if (eventType.startsWith('pointer')) {
            return;
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

function probeForDropdown(answerText, questionElement) {
  if (!questionElement) return;

  let container = questionElement;
  let levels = 0;
  // On remonte l'arbre DOM (jusqu'à 6 niveaux) pour trouver le conteneur global de la question
  while (container && container !== document.body && levels < 6) {
      if (container.querySelector('select, [role="combobox"], [role="listbox"], [aria-haspopup]')) {
          break; // On a trouvé le conteneur qui possède le menu déroulant !
      }
      container = container.parentElement;
      levels++;
  }

  let allDescendants = Array.from(container.querySelectorAll('*'));
  let semanticOpeners = [];
  let visualOpeners = [];
  
  for (let el of allDescendants) {
      let tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'select' || tag === 'input' || tag === 'label' || tag === 'a') continue; 
      
      let role = el.getAttribute('role');
      let hasPopup = el.getAttribute('aria-haspopup');
      
      if (role === 'combobox' || role === 'listbox' || hasPopup) {
          semanticOpeners.push(el);
      } else {
          try {
              let style = window.getComputedStyle(el);
              if (style && style.cursor === 'pointer' && (el.innerText || "").trim().length > 0) {
                  visualOpeners.push(el);
              }
          } catch(e) {}
      }
  }
  
  let openers = semanticOpeners.length > 0 ? semanticOpeners : visualOpeners;
  
  if (openers.length > 0) {
      let opener = openers[0]; 
      logDebug("Probing dropdown opener:", opener);
      
      clickProxy(opener, "opener");

      setTimeout(() => {
          logDebug("Retrying executeBestAction after probing...");
          executeBestAction(answerText, questionElement);
      }, 150);
  }
}

function executeBestAction(answerText, questionElement) {
  logDebug("Answer text:", answerText);
  if (!answerText) return false;
  
  let cleanAnswer = answerText.trim().toLowerCase();
  let superCleanAnswer = cleanAnswer.replace(/\s+/g, '');

  const allElements = Array.from(document.querySelectorAll('*'));
  const inputSelectors = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';
  
  const candidates = [];
  
  // Filtre récursif pour ignorer les éléments cachés ou dont les parents sont cachés (opacity: 0, height: 0, etc.)
  function isProbablyHidden(el) {
      if (!el) return true;
      if (el.tagName && el.tagName.toLowerCase() === 'option') return false; 
      
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
          try {
              let style = window.getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                  return true;
              }
              
              let rect = current.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) {
                  // Si l'élément lui-même est 0x0, ou si c'est un parent qui coupe le contenu (overflow hidden)
                  // Les menus Google Forms sont souvent des parents avec height 0
                  if (current === el || style.overflow !== 'visible') {
                      return true;
                  }
              }
          } catch(e) {}
          current = current.parentElement;
      }
      return false;
  }
  
  for (let i = 0; i < allElements.length; i++) {
    let el = allElements[i];
    
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'head' || tag === 'meta' || tag === 'link' || tag === 'title') continue;
    if (tag === 'input' && el.type && el.type.toLowerCase() === 'hidden') continue;
    if (el.closest('a')) continue; // Ne jamais cliquer sur un lien ou un élément à l'intérieur d'un lien

    // Règle de structure : on ne clique pas sur l'élément cliqué ni sur ses parents
    if (questionElement && el.contains(questionElement)) continue;
    
    // Filtre de visibilité : ignorer les éléments cachés
    if (isProbablyHidden(el)) continue;
    
    // 1. Vérifier si c'est un input vide
    if (el.matches && el.matches(inputSelectors)) {
      if (!el.value || el.value.trim() === '') {
        if (!isProbablyHidden(el)) candidates.push({ type: 'input', el: el, priority: 4 });
        continue; // Un input vide ne sera pas une "réponse cliquable"
      }
    }
    
    // 2. Vérifier si c'est une correspondance de texte
    let text = "";
    if (tag === 'input' || tag === 'textarea') {
        text = el.value || "";
    } else if (tag === 'option') {
        text = el.text || el.innerText || el.textContent || "";
    } else {
        text = el.innerText || el.textContent || "";
    }
    let cleanText = text.trim().toLowerCase();
    
    if (cleanText.length > 0 && cleanText.length < 80) {
      let superCleanText = cleanText.replace(/\s+/g, '');
      if (superCleanText === superCleanAnswer) {
        if (!isProbablyHidden(el)) candidates.push({ type: 'exact_match', el: el, priority: 1 });
      } else if (superCleanAnswer.length >= 3) {
        if (superCleanAnswer.includes(superCleanText) && superCleanText.length > 1) {
          // L'élément est un morceau de la réponse (Option de QCM Multiple)
          if (!isProbablyHidden(el)) candidates.push({ type: 'partial_match_child', el: el, priority: 2 });
        } else if (superCleanText.includes(superCleanAnswer)) {
          // L'élément englobe la réponse (Wrapper ou phrase longue)
          if (!isProbablyHidden(el)) candidates.push({ type: 'partial_match_parent', el: el, priority: 3 });
        }
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

} // Fin de la garde window.tqsExtensionInjected
