// This file contains all the JavaScript logic for the ChatAgad application.
// It handles user interactions, Firebase authentication, and real-time chat functionality.

// Import Firebase libraries as a module
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-firestore.js";

// Global variables for Firebase services and application state
let app, auth, db;
let userId = null;
let currentChatId = null;
let unsubscribeFromChat = null;
let unsubscribeFromMatching = null;
let isAuthReady = false; // New flag to track authentication status

// --- YOUR FIREBASE CONFIG ---
// This configuration is used to connect to your specific Firebase project.
// We'll use the variables provided by the environment for a seamless experience.
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.projectId;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// DOM elements
const homePage = document.getElementById('home-page');
const chatPage = document.getElementById('chat-page');
const interestContainer = document.getElementById('interest-container');
const interestInputField = document.querySelector('.interest-input-field');
const startBtn = document.querySelector('.start-btn');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const endChatBtn = document.getElementById('end-chat-btn');
const nextBtn = document.getElementById('next-btn');
const confirmationModal = document.getElementById('confirmation-modal');
const confirmEndBtn = document.getElementById('confirm-end-btn');
const cancelEndBtn = document.getElementById('cancel-end-btn');
const commonInterestsDisplay = document.getElementById('common-interests-display');
const quickMessagesContainer = document.getElementById('quick-messages');
const userIdDisplay = document.getElementById('user-id-display');
const loadingIndicator = document.getElementById('loading-indicator');

// Firestore collections
let matchingCollectionRef;
let chatsCollectionRef;
let currentInterests = [];

// --- Utility Functions ---
function show(element) {
    if (element) element.classList.remove('hidden');
}

function hide(element) {
    if (element) element.classList.add('hidden');
}

function saveInterests(interests) {
    localStorage.setItem('userInterests', JSON.stringify(interests));
}

function loadInterests() {
    const interestsString = localStorage.getItem('userInterests');
    return interestsString ? JSON.parse(interestsString) : [];
}

function renderInterests() {
    console.log("Rendering interests:", currentInterests);
    const existingBubbles = interestContainer.querySelectorAll('.interest-bubble');
    existingBubbles.forEach(bubble => bubble.remove());

    currentInterests.forEach(interest => {
        const bubble = document.createElement('span');
        bubble.classList.add('interest-bubble');
        bubble.textContent = interest;

        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-interest');
        removeBtn.textContent = 'x';
        removeBtn.addEventListener('click', () => {
            currentInterests = currentInterests.filter(item => item !== interest);
            saveInterests(currentInterests);
            renderInterests();
        });

        bubble.appendChild(removeBtn);
        interestContainer.insertBefore(bubble, interestInputField);
    });
}

function addMessage(senderId, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.setAttribute('data-sender-id', senderId);

    if (senderId === userId) {
        messageDiv.classList.add('message-me');
    } else if (senderId === 'system') {
        messageDiv.classList.add('text-center', 'text-gray-500', 'text-sm', 'my-2');
    } else {
        messageDiv.classList.add('message-stranger');
    }

    const textNode = document.createTextNode(text);
    messageDiv.appendChild(textNode);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderChatUI(interests) {
    if (interests.length > 0) {
        commonInterestsDisplay.innerHTML = `<p>You both like: <span class="font-semibold text-gray-800">${interests.join(', ')}</span></p>`;
    } else {
        commonInterestsDisplay.innerHTML = `<p>You're chatting with a random stranger.</p>`;
    }

    quickMessagesContainer.innerHTML = '';
    const defaultMessages = ['Hi', 'Hello', 'How are you?'];
    const interestMessages = interests.map(i => `What's your favorite thing about ${i}?`);
    const allMessages = [...defaultMessages, ...interestMessages];

    allMessages.forEach(msg => {
        const msgBubble = document.createElement('button');
        msgBubble.textContent = msg;
        msgBubble.classList.add('quick-message-bubble');
        msgBubble.addEventListener('click', () => {
            chatInput.value = msg;
        });
        quickMessagesContainer.appendChild(msgBubble);
    });
}

async function handleChatEnded() {
    console.log("Handling chat ended...");
    if (unsubscribeFromChat) {
        unsubscribeFromChat();
        unsubscribeFromChat = null;
    }
    if (unsubscribeFromMatching) {
        unsubscribeFromMatching();
        unsubscribeFromMatching = null;
    }
    currentChatId = null;
    hide(confirmationModal);
    hide(chatPage);
    show(homePage);
    chatBox.innerHTML = '';
    renderInterests();
    try {
        // Clean up user from the matching queue if they are still there
        await deleteDoc(doc(matchingCollectionRef, userId));
    } catch (error) {
        console.warn("Could not delete user from queue. They might not have been there.", error);
    }
}

async function findMatchOrAddToQueue() {
    console.log("Searching for a match or adding to queue...");
    try {
        const q = query(matchingCollectionRef);
        const querySnapshot = await getDocs(q);
        let matchedUserDoc = null;
        let commonInterests = [];

        querySnapshot.forEach(docSnap => {
            if (docSnap.id !== userId) {
                const matchedUserInterests = docSnap.data().interests || [];
                commonInterests = currentInterests.filter(interest => matchedUserInterests.includes(interest));
                if (commonInterests.length > 0 || (currentInterests.length === 0 && matchedUserInterests.length === 0)) {
                    if (!matchedUserDoc) {
                        matchedUserDoc = docSnap;
                    }
                }
            }
        });

        if (matchedUserDoc) {
            console.log("Match found with user:", matchedUserDoc.id);
            const newChatDoc = doc(chatsCollectionRef);
            currentChatId = newChatDoc.id;

            const chatData = {
                users: [userId, matchedUserDoc.id],
                commonInterests: commonInterests,
                createdAt: serverTimestamp(),
                status: 'active',
                messages: [{
                    senderId: 'system',
                    text: "You're now connected with a stranger. Say hello!",
                    timestamp: serverTimestamp()
                }]
            };

            await setDoc(newChatDoc, chatData);
            await deleteDoc(doc(matchingCollectionRef, matchedUserDoc.id));

            const currentUserDocInQueue = await getDoc(doc(matchingCollectionRef, userId));
            if (currentUserDocInQueue.exists()) {
                await deleteDoc(doc(matchingCollectionRef, userId));
            }
            listenForChatChanges(currentChatId);

        } else {
            console.log("No match found. Adding user to queue.");
            const userDocRef = doc(matchingCollectionRef, userId);
            await setDoc(userDocRef, {
                userId: userId,
                interests: currentInterests,
                status: 'searching',
                createdAt: serverTimestamp()
            });

            unsubscribeFromMatching = onSnapshot(query(chatsCollectionRef, where('users', 'array-contains', userId)), (querySnap) => {
                querySnap.forEach(docSnap => {
                    const chatData = docSnap.data();
                    if (chatData.users.includes(userId)) {
                        currentChatId = docSnap.id;
                        listenForChatChanges(currentChatId);
                        if (unsubscribeFromMatching) {
                            unsubscribeFromMatching();
                            unsubscribeFromMatching = null;
                        }
                    }
                });
            }, (error) => {
                console.error("Error listening for match:", error);
            });
        }
    } catch (error) {
        console.error("Error starting chat:", error);
        handleChatEnded();
    }
}

function startChat() {
    console.log("Start Chat button clicked.");
    if (!isAuthReady) {
        console.error("Authentication not ready. Cannot start chat.");
        return;
    }

    hide(homePage);
    show(chatPage);
    chatBox.innerHTML = `<div class="text-sm text-gray-500 text-center flex items-center justify-center space-x-2">
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
        <span>Connecting and searching...</span>
    </div>`;

    findMatchOrAddToQueue();
}

async function sendMessage() {
    console.log("Send message clicked.");
    if (!currentChatId || !userId) return;
    const message = chatInput.value.trim();
    if (message) {
        const chatDocRef = doc(chatsCollectionRef, currentChatId);
        try {
            const chatDoc = await getDoc(chatDocRef);
            if (chatDoc.exists()) {
                const currentMessages = chatDoc.data().messages || [];
                await updateDoc(chatDocRef, {
                    messages: [...currentMessages, { senderId: userId, text: message, timestamp: serverTimestamp() }]
                });
                chatInput.value = '';
            } else {
                handleChatEnded();
            }
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }
}

async function endChat() {
    console.log("End chat clicked.");
    if (!currentChatId) {
        handleChatEnded();
        return;
    }
    try {
        const chatDocRef = doc(chatsCollectionRef, currentChatId);
        await updateDoc(chatDocRef, {
            status: 'ended',
            endedAt: serverTimestamp()
        });
        handleChatEnded();
    } catch (error) {
        console.error("Error ending chat:", error);
    }
}

// --- Event Handlers ---
function handleInterestInput(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        console.log("Interest input keypress detected.");
        e.preventDefault();
        const interest = interestInputField.value.trim().toLowerCase();
        if (interest && interest.length > 0 && !currentInterests.includes(interest)) {
            currentInterests.push(interest);
            saveInterests(currentInterests);
            renderInterests();
            interestInputField.value = '';
        }
    }
}

function handleChatInputKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function handleEndChatButtonClick() {
    show(confirmationModal);
}

// --- Event Listeners and Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Script is loaded and DOM content is ready. Initializing Firebase.");

    // Initialize Firebase services immediately on page load
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        matchingCollectionRef = collection(db, `artifacts/${appId}/public/data/matching_queue`);
        chatsCollectionRef = collection(db, `artifacts/${appId}/public/data/chats`);
        console.log("Firebase services initialized.");

        // Sign in the user using the provided custom token if available, otherwise sign in anonymously
        if (initialAuthToken) {
            signInWithCustomToken(auth, initialAuthToken).catch(error => {
                console.error("Custom token sign-in failed:", error);
            });
        } else {
            signInAnonymously(auth).catch(error => {
                console.error("Anonymous sign-in failed:", error);
            });
        }

        // Listen for authentication state changes
        onAuthStateChanged(auth, user => {
            if (user) {
                userId = user.uid;
                isAuthReady = true;
                startBtn.disabled = false; // Enable the button after successful sign-in
                userIdDisplay.textContent = `User ID: ${userId}`;
                console.log("User authenticated with UID:", userId);
            } else {
                userId = null;
                isAuthReady = false;
                startBtn.disabled = true; // Disable the button if not authenticated
                userIdDisplay.textContent = `User ID: Not authenticated`;
                console.warn("Authentication state changed: User is not authenticated.");
            }
        });

    } catch (error) {
        console.error("Firebase Initialization or Auth Error:", error);
    }

    // Attach all event listeners
    interestInputField.addEventListener('keyup', handleInterestInput);
    startBtn.addEventListener('click', startChat);
    chatInput.addEventListener('keypress', handleChatInputKeyPress);
    sendBtn.addEventListener('click', sendMessage);
    endChatBtn.addEventListener('click', handleEndChatButtonClick);
    confirmEndBtn.addEventListener('click', endChat);
    cancelEndBtn.addEventListener('click', () => hide(confirmationModal));
    nextBtn.addEventListener('click', () => {
        handleChatEnded();
        startChat();
    });

    // Load saved interests and render them
    currentInterests = loadInterests();
    renderInterests();

    // Ensure the home page is the only page visible on load
    show(homePage);
    hide(chatPage);
    hide(confirmationModal);
});
