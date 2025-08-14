import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
 * ===================================================================================
 * Your Firestore security rules should look like this.
 * ===================================================================================
 *
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        
        match /status/{userId} {
          allow read: if request.auth != null;
          allow write, delete: if request.auth.uid == userId;
        }
    
        match /queue/{userId} {
          allow read: if request.auth != null;
          allow create, delete: if request.auth.uid == userId;
          allow update: if request.auth.uid != userId; // Allow others to update your queue doc
        }
    
        match /chats/{chatId} {
          // Allow create if you are one of the participants
          allow create: if request.auth.uid in request.resource.data.participants;
          // Allow read/update if you are a participant
          allow read, update, delete: if request.auth.uid in resource.data.participants;
          
          match /messages/{messageId} {
            // Allow read/write if you are a participant of the parent chat
            allow read, write: if get(/databases/$(database)/documents/chats/$(chatId)).data.participants.hasAny([request.auth.uid]);
          }
        }
      }
    }
 *
 */

const firebaseConfig = {
    apiKey: "AIzaSyALyckXNK7FbzpqZGP4Lr5eVRQJVseh0fQ",
    authDomain: "chatagad-app.firebaseapp.com",
    projectId: "chatagad-app",
    storageBucket: "chatagad-app.firebasestorage.app",
    messagingSenderId: "946806283279",
    appId: "1:946806283279:web:78ad7293e5a0a2017dd77a",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let interests = [];
let searchTimeout;
let queueListener = null; 
let messageListener = null;
let strangerStatusListener = null;
let currentChatId = null;
let onlineCountListener = null;
let endChatConfirmationTimeout = null;
let isChatDisconnected = false;
let typingTimeout = null;
let isTyping = false;

const mainContainer = document.getElementById('main-container');
const homeScreen = document.getElementById('home-screen');
const loadingScreen = document.getElementById('loading-screen');
const chatScreen = document.getElementById('chat-screen');
const interestInput = document.getElementById('interest-input');
const interestsContainer = document.getElementById('interests-container');
const startChatBtn = document.getElementById('start-chat-btn');
const onlineUsersEl = document.getElementById('online-users');
const loadingMessage = document.getElementById('loading-message');
const cancelSearchBtn = document.getElementById('cancel-search-btn');
const endChatBtn = document.getElementById('end-chat-btn');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatInputArea = document.getElementById('chat-input-area');
const postChatActions = document.getElementById('post-chat-actions');
const okayNextBtn = document.getElementById('okay-next-btn');
const mainMenuBtn = document.getElementById('main-menu-btn');
const commonInterestsDisplay = document.getElementById('common-interests-display');
const startupPrompt = document.getElementById('startup-prompt');
const ageCheckbox = document.getElementById('age-checkbox');
const termsCheckbox = document.getElementById('terms-checkbox');
const letsGoBtn = document.getElementById('lets-go-btn');
const leftAd = document.getElementById('left-ad');
const rightAd = document.getElementById('right-ad');
const addInterestBtn = document.getElementById('add-interest-btn');

// --- Mobile Viewport Height Fix ---
function setScreenHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    mainContainer.style.height = `${window.innerHeight}px`;
}


// --- Theme Toggle ---
const themeToggleBtnHome = document.getElementById('theme-toggle-btn-home');
const sunIconHome = document.getElementById('sun-icon-home');
const moonIconHome = document.getElementById('moon-icon-home');
const themeToggleBtnChat = document.getElementById('theme-toggle-btn-chat');
const sunIconChat = document.getElementById('sun-icon-chat');
const moonIconChat = document.getElementById('moon-icon-chat');

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        sunIconHome.classList.add('hidden');
        moonIconHome.classList.remove('hidden');
        sunIconChat.classList.add('hidden');
        moonIconChat.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        sunIconHome.classList.remove('hidden');
        moonIconHome.classList.add('hidden');
        sunIconChat.classList.remove('hidden');
        moonIconChat.classList.add('hidden');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    const newTheme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

// --- Startup Prompt Logic ---
function initializeStartupPrompt() {
    const hasAgreedToTerms = localStorage.getItem('chatagad_agreed_to_terms');

    if (hasAgreedToTerms === 'true') {
        startupPrompt.classList.add('hidden');
        mainContainer.classList.remove('invisible');
        leftAd.classList.remove('invisible');
        rightAd.classList.remove('invisible');
        main(); 
    } else {
        startupPrompt.classList.remove('hidden'); 
        function checkCheckboxes() {
            letsGoBtn.disabled = !(ageCheckbox.checked && termsCheckbox.checked);
        }

        ageCheckbox.addEventListener('change', checkCheckboxes);
        termsCheckbox.addEventListener('change', checkCheckboxes);

        letsGoBtn.addEventListener('click', () => {
            localStorage.setItem('chatagad_agreed_to_terms', 'true');
            startupPrompt.classList.add('hidden');
            mainContainer.classList.remove('invisible');
            leftAd.classList.remove('invisible');
            rightAd.classList.remove('invisible');
            main(); 
        });
    }
}

// --- Main Application Logic ---
async function main() {
    startChatBtn.disabled = true;
    startChatBtn.textContent = "Connecting...";
    try {
        if (auth.currentUser) {
            currentUser = auth.currentUser;
        } else {
            const userCredential = await signInAnonymously(auth);
            currentUser = userCredential.user;
        }
        console.log(`[User ${currentUser.uid.substring(0,5)}] Signed in.`);
        
        loadInterests();
        initializeOnlineFeatures();
        
        await updateUserHeartbeat();
        setInterval(updateUserHeartbeat, 30000); 

        startChatBtn.disabled = false;
        startChatBtn.textContent = "Start Chat";

    } catch (error) {
        console.error("Authentication failed:", error);
        let errorMessage = '<div class="text-center text-red-500 p-8">Could not connect to the server. Please refresh the page.</div>';
        if (error.code === 'auth/network-request-failed') {
            errorMessage = '<div class="text-center text-red-500 p-8"><strong>Network Error:</strong> Could not connect to authentication services. Please check your internet connection, disable any ad-blockers, and refresh the page.</div>';
        }
        mainContainer.innerHTML = errorMessage;
    }
}

function initializeOnlineFeatures() {
    if (onlineCountListener) return;

    const statusRef = collection(db, "status");
    onlineCountListener = onSnapshot(statusRef, (snapshot) => {
        let onlineCount = 0;
        const now = Date.now();
        snapshot.forEach(doc => {
            const userStatus = doc.data();
            if (userStatus.timestamp) {
                const lastSeen = userStatus.timestamp.toMillis();
                if ((now - lastSeen) < 60000) { 
                    onlineCount++;
                }
            }
        });
        // onlineUsersEl.textContent = onlineCount;
    }, (error) => {
        console.error("Error getting online users count:", error);
        // onlineUsersEl.textContent = 'N/A';
    });
}

async function updateUserHeartbeat() {
    if (!currentUser) return;
    const userStatusRef = doc(db, "status", currentUser.uid);
    try {
        await setDoc(userStatusRef, { 
            timestamp: serverTimestamp() 
        }, { merge: true });
    } catch (error) {
        console.error("Failed to update user heartbeat:", error);
    }
}

window.addEventListener('beforeunload', (event) => {
    // This function is key to handling disconnections on page refresh/close.
    if (currentChatId && !isChatDisconnected) {
        const chatDocRef = doc(db, "chats", currentChatId);
        // We mark the chat with the ID of the user who is leaving.
        updateDoc(chatDocRef, { disconnected: currentUser.uid });
    }
    
    // Clean up user status and queue documents.
    if (currentUser) {
        if (queueListener) {
             deleteDoc(doc(db, "queue", currentUser.uid));
        }
        deleteDoc(doc(db, "status", currentUser.uid));
    }
});

// --- Interests Handling ---
function loadInterests() {
    const savedInterests = localStorage.getItem('chatagad_interests');
    if (savedInterests) {
        try {
            interests = JSON.parse(savedInterests);
            renderInterests();
        } catch (e) {
            console.error("Could not parse saved interests:", e);
            interests = [];
        }
    }
}

function addInterestFromInput() {
    const interest = interestInput.value.trim().toLowerCase();
    if (interest && !interests.includes(interest)) {
        interests.push(interest);
        renderInterests();
        interestInput.value = '';
    }
}

function renderInterests() {
    interestsContainer.innerHTML = '';
    interests.forEach(interest => {
        const bubble = document.createElement('div');
        bubble.className = 'interest-bubble';
        bubble.textContent = interest;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&times;'; 
        removeBtn.onclick = () => {
            interests = interests.filter(i => i !== interest);
            renderInterests();
        };
        bubble.appendChild(removeBtn);
        interestsContainer.appendChild(bubble);
    });
    localStorage.setItem('chatagad_interests', JSON.stringify(interests));
}

// --- Chat Logic ---
async function startSearch() {
    if (!currentUser) {
        return;
    }
    homeScreen.classList.add('hidden');
    loadingScreen.classList.remove('hidden');
    loadingMessage.textContent = 'Looking for someone to chat with...';
    
    try {
        const queueRef = collection(db, "queue");
        const recentTimeThreshold = new Date(Date.now() - 60 * 1000);
        
        let potentialMatches = [];

        let q;
        if (interests.length > 0) {
            q = query(queueRef, where("interests", "array-contains-any", interests));
        } else {
            q = query(queueRef, 
                where("interests", "==", []),
                where("timestamp", ">", recentTimeThreshold)
            );
        }
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (doc.id !== currentUser.uid && data.timestamp && data.timestamp.toDate() > recentTimeThreshold) {
                potentialMatches.push(doc);
            }
        });
        
        let matchFound = false;
        if (potentialMatches.length > 0) {
            const userDoc = potentialMatches[0]; // Take the first available match
            const strangerId = userDoc.id;
            const strangerInterests = userDoc.data().interests || [];
            console.log(`[User ${currentUser.uid.substring(0,5)}] Found potential match: ${strangerId.substring(0,5)}. Initiating chat.`);
            await initiateChat(strangerId, strangerInterests);
            matchFound = true;
            return; 
        }

        if (!matchFound) {
            const userQueueDocRef = doc(db, "queue", currentUser.uid);
            await setDoc(userQueueDocRef, {
                interests: interests,
                timestamp: serverTimestamp()
            });
            console.log(`[User ${currentUser.uid.substring(0,5)}] No match found. Entering queue and waiting...`);
            
            if (queueListener) queueListener(); 
            queueListener = onSnapshot(userQueueDocRef, (docSnap) => {
                console.log(`[User ${currentUser.uid.substring(0,5)}] My queue document was updated. Checking for match...`);
                const data = docSnap.data();
                if (data && data.matchedInChat) {
                    console.log(`[User ${currentUser.uid.substring(0,5)}] Match confirmed! Joining chat: ${data.matchedInChat}`);
                    startChatSession(data.matchedInChat);
                } else {
                    console.log(`[User ${currentUser.uid.substring(0,5)}] Queue doc updated, but no match field found yet.`);
                }
            });

            searchTimeout = setTimeout(() => {
                loadingMessage.innerHTML = "Can't find a match. Try adding more interests or <a href='#' id='remove-interests-link' class='text-blue-600'>removing them</a> for a faster search.";
                document.getElementById('remove-interests-link')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    interests = [];
                    renderInterests();
                    cancelSearch();
                    startSearch();
                });
            }, 15000);
        }

    } catch (error) {
        console.error("Error starting search:", error);
        addSystemMessage("An error occurred during search. Please try again.");
        cancelSearch();
    }
}

async function initiateChat(strangerId, strangerInterests) {
    console.log(`[User ${currentUser.uid.substring(0,5)}] Notifying stranger: ${strangerId.substring(0,5)}`);
    
    const myInterests = new Set(interests);
    const commonInterests = strangerInterests.filter(interest => myInterests.has(interest));

    const newChatRef = await addDoc(collection(db, "chats"), {
        participants: [currentUser.uid, strangerId],
        createdAt: serverTimestamp(),
        disconnected: null,
        commonInterests: commonInterests,
        typing: {}
    });
    console.log(`[User ${currentUser.uid.substring(0,5)}] Chat room created: ${newChatRef.id}`);
    
    await updateDoc(doc(db, "queue", strangerId), { matchedInChat: newChatRef.id });
    console.log(`[User ${currentUser.uid.substring(0,5)}] Notified stranger ${strangerId.substring(0,5)}.`);
    
    startChatSession(newChatRef.id);
}

function startChatSession(chatId) {
    console.log(`[User ${currentUser.uid.substring(0,5)}] Entering chat session: ${chatId}`);
    clearTimeout(searchTimeout);
    isChatDisconnected = false; 
    
    if(currentUser) {
        deleteDoc(doc(db, "queue", currentUser.uid));
    }
    if (queueListener) queueListener();
    queueListener = null;

    currentChatId = chatId;
    loadingScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    chatInputArea.classList.remove('hidden');
    postChatActions.classList.add('hidden');
    listenForMessages(chatId);
}

function cancelSearch() {
    clearTimeout(searchTimeout);
    if(queueListener) queueListener();
    queueListener = null;
    if(currentUser) {
        deleteDoc(doc(db, "queue", currentUser.uid));
    }
    loadingScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

function endChat() {
    if (currentChatId) {
        try {
            const chatDocRef = doc(db, "chats", currentChatId);
            updateDoc(chatDocRef, { disconnected: currentUser.uid });
            showPostChatActions("You ended the chat.");
        } catch(e) {
            console.error("Error ending chat:", e);
            goHome(); 
        }
    }
}

function resetEndChatButton() {
    endChatBtn.textContent = "End";
    endChatBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600', 'text-white');
    endChatBtn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    delete endChatBtn.dataset.state;
}

function goHome() {
    chatScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    messagesContainer.innerHTML = '';
    commonInterestsDisplay.innerHTML = '';
    currentChatId = null;
    isChatDisconnected = false; 
    
    if (messageListener) messageListener();
    messageListener = null;
    if (strangerStatusListener) strangerStatusListener();
    strangerStatusListener = null;

    resetEndChatButton();
    clearTimeout(endChatConfirmationTimeout);

    chatInputArea.classList.remove('hidden');
    postChatActions.classList.add('hidden');
}

function showPostChatActions(message) {
    addSystemMessage(message);
    isChatDisconnected = true; 
    
    if (messageListener) messageListener();
    messageListener = null;
    if (strangerStatusListener) strangerStatusListener();
    strangerStatusListener = null;
    
    chatInputArea.classList.add('hidden');
    postChatActions.classList.remove('hidden');
}

// --- Messaging & Typing Indicator ---
async function updateTypingStatus(typing) {
    if (!currentChatId || isTyping === typing) return;
    isTyping = typing;
    const chatDocRef = doc(db, "chats", currentChatId);
    const typingUpdate = {};
    typingUpdate[`typing.${currentUser.uid}`] = typing;
    await updateDoc(chatDocRef, typingUpdate);
}

function handleTyping() {
    clearTimeout(typingTimeout);
    updateTypingStatus(true);
    typingTimeout = setTimeout(() => {
        updateTypingStatus(false);
    }, 2000); 
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (text === '' || !currentChatId) return;
    
    clearTimeout(typingTimeout);
    updateTypingStatus(false);

    try {
        const messagesRef = collection(db, "chats", currentChatId, "messages");
        await addDoc(messagesRef, {
            senderId: currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
        messageInput.value = '';
        messageInput.focus();
    } catch (error) {
        console.error("Error sending message:", error);
        addSystemMessage("Error: Could not send message.");
    }
}

function listenForMessages(chatId) {
    if (messageListener) messageListener(); 
    if (strangerStatusListener) strangerStatusListener();

    const chatDocRef = doc(db, "chats", chatId);
    messageListener = onSnapshot(chatDocRef, (docSnap) => {
        const data = docSnap.data();
        if (data) {
            // This is where we listen for the 'disconnected' flag.
            if (data.disconnected && data.disconnected !== currentUser.uid && !isChatDisconnected) {
                showPostChatActions("Stranger has ended the chat.");
            }
            if (data.commonInterests) {
                displayCommonInterests(data.commonInterests);
            }
            const participants = data.participants || [];
            const strangerId = participants.find(id => id !== currentUser.uid);
            if (strangerId && data.typing && data.typing[strangerId]) {
                showTypingIndicator();
            } else {
                hideTypingIndicator();
            }
        }
    });

    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    strangerStatusListener = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                hideTypingIndicator();
                const msg = change.doc.data();
                displayMessage(msg);
            }
        });
    }, (error) => {
        console.error("Error listening for messages:", error);
        goHome();
    });
}

function showTypingIndicator() {
    if (document.getElementById('typing-indicator')) return;
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.classList.add('mb-2', 'max-w-xs', 'p-2', 'px-3', 'rounded-2xl', 'w-fit', 'bg-gray-200', 'dark:bg-gray-700', 'mr-auto');
    indicator.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function displayCommonInterests(common) {
    if (common && common.length > 0) {
        commonInterestsDisplay.innerHTML = `You both like: <span class="font-semibold text-blue-600 dark:text-blue-400">${common.join(', ')}</span>`;
    } else {
        commonInterestsDisplay.innerHTML = '';
    }
}

function displayMessage(msg) {
    const msgDiv = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = msg.text;

    msgDiv.classList.add('mb-2', 'max-w-xs', 'p-2', 'px-3', 'rounded-2xl', 'w-fit');

    if (msg.senderId === currentUser.uid) {
        msgDiv.classList.add('bg-blue-600', 'text-white', 'ml-auto');
    } else {
        msgDiv.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200', 'mr-auto');
    }
    msgDiv.appendChild(p);
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-center text-sm my-2 text-gray-500 italic';
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Initialize Event Listeners on DOM Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Set initial screen height and listen for changes
    setScreenHeight();
    window.addEventListener('resize', setScreenHeight);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setScreenHeight);
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    }
    
    initializeStartupPrompt();
    themeToggleBtnHome.addEventListener('click', toggleTheme);
    themeToggleBtnChat.addEventListener('click', toggleTheme);
    addInterestBtn.addEventListener('click', addInterestFromInput);
    interestInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addInterestFromInput();
        }
    });
    startChatBtn.addEventListener('click', startSearch);
    cancelSearchBtn.addEventListener('click', cancelSearch);
    endChatBtn.addEventListener('click', () => {
        if (endChatBtn.dataset.state === 'confirm') {
            clearTimeout(endChatConfirmationTimeout);
            endChat();
        } else {
            endChatBtn.textContent = "Sure?";
            endChatBtn.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
            endChatBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'text-white');
            endChatBtn.dataset.state = 'confirm';

            endChatConfirmationTimeout = setTimeout(() => {
                resetEndChatButton();
            }, 3000);
        }
    });
    mainMenuBtn.addEventListener('click', goHome);
    okayNextBtn.addEventListener('click', () => {
        goHome();
        setTimeout(startSearch, 100);
    });
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    messageInput.addEventListener('input', handleTyping);
});
