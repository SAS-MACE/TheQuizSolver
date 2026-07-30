document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleVisibilityBtn = document.getElementById('toggleVisibility');
  const saveBtn = document.getElementById('saveBtn');
  const statusMessage = document.getElementById('statusMessage');
  const eyeIconPath = document.querySelector('#eyeIcon path');
  const btnText = document.querySelector('.btn-text');
  const checkIcon = document.querySelector('.check-icon');

  // Charger la clé existante
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Gérer l'affichage/masquage de la clé
  let isPasswordVisible = false;
  toggleVisibilityBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    apiKeyInput.type = isPasswordVisible ? 'text' : 'password';
    
    if (isPasswordVisible) {
      // Icône œil barré
      eyeIconPath.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22');
    } else {
      // Icône œil normal
      eyeIconPath.setAttribute('d', 'M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z');
    }
  });

  // Sauvegarder la clé
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showMessage('Veuillez entrer une clé valide', 'error');
      return;
    }

    // Effet visuel sur le bouton
    const originalText = btnText.textContent;
    btnText.textContent = 'Sauvegardé';
    saveBtn.classList.add('success');
    checkIcon.classList.remove('hidden');
    
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      showMessage('Clé sauvegardée avec succès !', 'success');
      
      // Remettre le bouton à son état normal après 2s
      setTimeout(() => {
        btnText.textContent = originalText;
        saveBtn.classList.remove('success');
        checkIcon.classList.add('hidden');
      }, 2000);
    });
  });

  function showMessage(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message show ${type}`;
    
    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 3000);
  }
});
