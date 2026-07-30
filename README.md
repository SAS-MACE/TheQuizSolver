# Genius AI Quiz Solver (Extension AI)

**Genius AI Quiz Solver** est une extension de navigateur discrète et puissante alimentée par l'intelligence artificielle (Gemini). Elle permet d'obtenir instantanément la réponse à une question sélectionnée sur n'importe quelle page web, en toute discrétion.

L'astuce de cette extension réside dans son mode d'affichage : au lieu d'ouvrir une fenêtre pop-up visible, **elle modifie temporairement le nom du premier favori de votre barre de favoris** pour y afficher la réponse courte. Idéal pour avoir un coup de pouce sans attirer l'attention !

## ✨ Fonctionnalités Principales

- **Déclencheur rapide** : Sélectionnez une question sur une page web et appuyez sur la touche `ù`.
- **Analyse Multimodale** : L'extension prend une capture d'écran de l'onglet actif et l'envoie avec votre texte à l'API Google Gemini (modèle `gemini-3.1-flash-lite`) pour mieux comprendre le contexte de la question.
- **Affichage Ultra-Discret** : La réponse est affichée en remplaçant le nom de votre premier favori. Le favori retrouve son état initial (nommé "Google") après 10 secondes.
- **Configuration simple** : Une interface utilisateur claire (popup) pour renseigner et sauvegarder votre clé d'API Gemini.

## 🛠️ Stack Technique

- **Manifest V3** : Le standard le plus récent pour les extensions Chrome.
- **Service Worker** (`background.js`) : Gère les requêtes API en arrière-plan et la manipulation des favoris (`chrome.bookmarks`).
- **Content Script** (`content.js`) : Injecté dans chaque page pour écouter les frappes clavier (touche `ù`) et lire le texte sélectionné.
- **Chrome Storage** : Utilisé pour sauvegarder de manière persistante la clé d'API Gemini.
- **HTML/CSS/JS (Vanilla)** : Interface du popup légère, avec un design moderne (SVG, polices Google Inter).

## 🚀 Installation & Utilisation

1. **Obtenir une clé API** : Allez sur [Google AI Studio](https://aistudio.google.com/app/apikey) et générez une clé d'API.
2. **Charger l'extension** :
   - Ouvrez votre navigateur Chrome/Edge et allez sur `chrome://extensions/`.
   - Activez le **Mode développeur** (en haut à droite).
   - Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `src` du projet.
3. **Configuration** :
   - Cliquez sur l'icône de l'extension dans votre navigateur.
   - Collez votre clé d'API Gemini et cliquez sur **Sauvegarder**.
4. **Utilisation** :
   - Sur n'importe quelle page web, surlignez une question.
   - Appuyez sur la touche **`ù`**.
   - Regardez votre premier favori dans la barre des favoris : il affichera "⏳ Recherche..." puis la réponse à la question.

## 📁 Structure du Projet

```text
ExtensionAI/
├── src/
│   ├── manifest.json       # Configuration de l'extension (Manifest V3)
│   ├── background.js       # Logique d'arrière-plan (Appel API Gemini, Favoris)
│   ├── content.js          # Script injecté (Détection de la touche ù et sélection)
│   ├── popup.html          # Interface de configuration (Clé API)
│   ├── popup.css           # Styles de l'interface
│   ├── popup.js            # Logique de sauvegarde de la clé API
│   └── images/             # Icônes de l'extension
└── promo/                  # Assets promotionnels
```

---

## 📝 TODO & Améliorations Possibles

- **Restauration Intelligente du Favori** : Actuellement, le favori est toujours renommé en "Google" après 10 secondes. Il serait préférable de sauvegarder le nom original et l'URL du favori initial pour le restaurer exactement comme il était, ou d'utiliser un dossier de favoris dédié.
- **Raccourci Clavier Personnalisable** : Permettre à l'utilisateur de choisir sa propre touche de déclenchement (au lieu du `ù` codé en dur) via une page d'options.
- **Choix du Modèle IA** : Ajouter la possibilité dans la popup de choisir différents modèles Gemini (ex: Pro vs Flash) selon le besoin de rapidité ou de précision.
- **Mode d'Affichage Alternatif** : Offrir une option pour afficher la réponse dans une notification système discrète (`chrome.notifications`) au lieu d'utiliser la barre de favoris.
- **Internationalisation (i18n)** : Ajouter le support multilingue pour les textes de l'interface (popup) et pour les prompts système envoyés à l'IA.
- **Gestion des Erreurs Améliorée** : Afficher des messages plus clairs si le quota de l'API est dépassé ou si la clé est invalide, directement via l'affichage discret.
