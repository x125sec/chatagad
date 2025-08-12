// This file should be named 'script.js' and placed in the same folder as your index.html file.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("ChatAgad script loaded successfully.");

    // --- Firebase Global Variables (declared but not initialized yet) ---
    let app = null;
    let db = null;
    let auth = null;
    const appId = "chatagad-app"; // Using the projectId as a unique identifier

    let userId = null;
    let unsubscribeFromChat = null;
    let unsubscribeFromMatching = null;
    let isFirebaseInitialized = false;

    // --- DOM Elements ---
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

    // --- Firestore Collection Paths (will be initialized after Firebase) ---
    let matchingCollectionRef;
    let chatsCollectionRef;
    let currentChatId = null;

    // Disable the start button initially to prevent race conditions with authentication
    startBtn.disabled = false;

    // --- Utility Functions ---
    function show(element) {
        element.classList.remove('hidden');
    }

    function hide(element) {
        element.classList.add('hidden');
    }
    
    function saveInterests(interests) {
        localStorage.setItem('userInterests', JSON.stringify(interests));
    }

    function loadInterests() {
        const interestsString = localStorage.getItem('userInterests');
        return interestsString ? JSON.parse(interestsString) : [];
    }

    function renderInterests() {
        console.log('Rendering interests:', currentInterests);
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

    function listenForChatChanges(chatId) {
        console.log(`Setting up listener for chat ID: ${chatId}`);
        const chatDocRef = doc(chatsCollectionRef, chatId);
        unsubscribeFromChat = onSnapshot(chatDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const chatData = docSnap.data();
                
                if (chatData.status === 'ended') {
                    console.log(`Chat document ${chatId} status is 'ended'. Ending chat gracefully.`);
                    handleChatEnded();
                    return;
                }

                chatBox.innerHTML = '';
                renderChatUI(chatData.commonInterests || []);

                const chatMessages = chatData.messages || [];
                chatMessages.forEach(msg => {
                    addMessage(msg.senderId, msg.text);
                });
            } else {
                console.log(`Chat document ${chatId} no longer exists. Ending chat.`);
                handleChatEnded();
            }
        }, (error) => {
            console.error("Error listening to chat:", error);
            handleChatEnded();
        });
    }

    async function initializeFirebaseAndAuth() {
        if (isFirebaseInitialized) return;

        const firebaseConfig = {
            apiKey: "AIzaSyALyckXNK7FbzpqZGP4Lr5eVRQJVseh0fQ",
            authDomain: "chatagad-app.firebaseapp.com",
            projectId: "chatagad-app",
            storageBucket: "chatagad-app.firebasestorage.app",
            messagingSenderId: "946806283279",
            appId: "1:946806283279:web:78ad7293e5a0a2017dd77a",
            measurementId: "G-7J5TKXQB1X"
        };
        
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            matchingCollectionRef = collection(db, `artifacts/${appId}/public/data/matching_queue`);
            chatsCollectionRef = collection(db, `artifacts/${appId}/public/data/chats`);
            isFirebaseInitialized = true;

            await signInAnonymously(auth);

            auth.onAuthStateChanged(user => {
                if (user) {
                    userId = user.uid;
                    console.log(`User authenticated with ID: ${userId}`);
                    findMatchOrAddToQueue();
                } else {
                    userId = null;
                    console.log("User not authenticated.");
                    chatBox.innerHTML = `<p class="text-sm text-red-500 text-center">Authentication failed. Please try again.</p>`;
                }
            });
        } catch (error) {
            console.error("Firebase Initialization or Auth Error:", error);
            chatBox.innerHTML = `<p class="text-sm text-red-500 text-center">Connection failed. Please check your internet connection.</p>`;
        }
    }

    async function findMatchOrAddToQueue() {
        try {
            console.log("Searching for an available match...");
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
                console.log("Match found! Creating a new chat.");
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
                console.log(`Chat started with ${matchedUserDoc.id}. Chat ID: ${currentChatId}`);
            } else {
                console.log("No match found. Adding user to queue and listening for a match.");
                const userDocRef = doc(matchingCollectionRef, userId);
                await setDoc(userDocRef, {
                    userId: userId,
                    interests: currentInterests,
                    status: 'searching',
                    createdAt: serverTimestamp()
                });
                console.log(`User ${userId} added to matching queue.`);

                unsubscribeFromMatching = onSnapshot(query(chatsCollectionRef, where('users', 'array-contains', userId)), (querySnap) => {
                    querySnap.forEach(docSnap => {
                        const chatData = docSnap.data();
                        if (chatData.users.includes(userId)) {
                            currentChatId = docSnap.id;
                            console.log(`Matched! Chat ID: ${currentChatId}`);
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


    async function startChat() {
        console.log("Start Chat button clicked.");

        hide(homePage);
        show(chatPage);
        chatBox.innerHTML = `<p class="text-sm text-gray-500 text-center">
            <span class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></span>
            Connecting and searching...
        </p>`;

        if (!isFirebaseInitialized) {
            await initializeFirebaseAndAuth();
        } else if (userId) {
            findMatchOrAddToQueue();
        }
    }


    async function sendMessage() {
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
                    console.error("Error sending message: Chat document does not exist.");
                    handleChatEnded();
                }
            } catch (error) {
                console.error("Error sending message:", error);
            }
        }
    }

    async function endChat() {
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
            console.log(`Chat ${currentChatId} status updated to 'ended'.`);
            handleChatEnded();
        } catch (error) {
            console.error("Error ending chat:", error);
        }
    }

    function handleChatEnded() {
        if (unsubscribeFromChat) {
            console.log("Unsubscribing from chat listener.");
            unsubscribeFromChat();
            unsubscribeFromChat = null;
        }
        if (unsubscribeFromMatching) {
            console.log("Unsubscribing from matching listener.");
            unsubscribeFromMatching();
            unsubscribeFromMatching = null;
        }
        currentChatId = null;
        hide(confirmationModal);
        hide(chatPage);
        show(homePage);
        chatBox.innerHTML = '';
        renderInterests();
    }

    // --- Event Handlers ---
    function handleInterestInput(e) {
        if (e.key === 'Enter' || e.key === ' ') {
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

    // --- Event Listeners ---
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

    // Initial setup on page load
    let currentInterests = loadInterests();
    renderInterests();
    show(homePage); // Show the initial home page on load
});
