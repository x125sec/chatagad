// This file should be named 'script.js' and placed in the same folder as your index.html file.

// FIX: Updated Firebase SDK version to 11.10.1 for better stability and to resolve import issues.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    // Confirm that the script has loaded and is running
    console.log("ChatAgad script loaded successfully.");

    // --- Firebase Initialization and Auth ---
    // This is your Firebase project's configuration.
    // The getAnalytics and measurementId are not needed for this app's current functionality.
    const firebaseConfig = {
        apiKey: "AIzaSyALyckXNK7FbzpqZGP4Lr5eVRQJVseh0fQ",
        authDomain: "chatagad-app.firebaseapp.com",
        projectId: "chatagad-app",
        storageBucket: "chatagad-app.firebasestorage.app",
        messagingSenderId: "946806283279",
        appId: "1:946806283279:web:78ad7293e5a0a2017dd77a",
        measurementId: "G-7J5TKXQB1X"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const appId = "chatagad-app"; // Using the projectId as a unique identifier

    let userId = null;
    let unsubscribeFromChat = null;
    let unsubscribeFromMatching = null;

    // Show the user ID for debugging and connection
    const userIdDisplay = document.getElementById('user-id-display');

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

    // Disable the start button initially to prevent race conditions with authentication
    startBtn.disabled = true;

    // Authenticate the user. If an auth token is provided, use it. Otherwise, sign in anonymously.
    try {
        const initialAuthToken = null; // In a real environment, this might come from a server
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase Auth Error:", error);
    }
    
    // Listen for auth state changes to get the userId and proceed
    auth.onAuthStateChanged(user => {
        if (user) {
            userId = user.uid;
            userIdDisplay.textContent = `Your User ID: ${userId}`;
            // Remove the line that was making the user ID visible on the homepage
            console.log(`User authenticated with ID: ${userId}`);
            // Enable the start button once authenticated
            startBtn.disabled = false;
        } else {
            userId = null;
            userIdDisplay.classList.add('hidden');
            console.log("User not authenticated.");
            startBtn.disabled = true;
        }
    });

    // --- Firestore Collection Paths ---
    // We use a public collection path for matching and chats so users can find each other.
    const matchingCollectionRef = collection(db, `artifacts/${appId}/public/data/matching_queue`);
    const chatsCollectionRef = collection(db, `artifacts/${appId}/public/data/chats`);

    // --- State and Data ---
    let currentInterests = [];
    let currentChatId = null;

    // --- Utility Functions ---
    /**
     * Shows a hidden element by removing the 'hidden' class.
     * @param {HTMLElement} element - The DOM element to show.
     */
    function show(element) {
        element.classList.remove('hidden');
    }

    /**
     * Hides an element by adding the 'hidden' class.
     * @param {HTMLElement} element - The DOM element to hide.
     */
    function hide(element) {
        element.classList.add('hidden');
    }
    
    /**
     * Saves the user's interests to localStorage for persistence.
     * @param {Array<string>} interests - The array of interests to save.
     */
    function saveInterests(interests) {
        localStorage.setItem('userInterests', JSON.stringify(interests));
    }

    /**
     * Loads the user's interests from localStorage.
     * @returns {Array<string>} The array of saved interests, or an empty array.
     */
    function loadInterests() {
        const interestsString = localStorage.getItem('userInterests');
        return interestsString ? JSON.parse(interestsString) : [];
    }

    /**
     * Renders the user's interests as clickable bubbles on the home page.
     */
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

    /**
     * Adds a new message to the chat display.
     * @param {string} senderId - The ID of the sender.
     * @param {string} text - The content of the message.
     */
    function addMessage(senderId, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        
        // Add a data attribute to store the sender ID, which is a key fix
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

    /**
     * Renders the common interests and quick messages when a chat starts.
     * @param {Array<string>} interests - The list of common interests.
     */
    function renderChatUI(interests) {
        // Display common interests
        if (interests.length > 0) {
            commonInterestsDisplay.innerHTML = `<p>You both like: <span class="font-semibold text-gray-800">${interests.join(', ')}</span></p>`;
        } else {
            commonInterestsDisplay.innerHTML = `<p>You're chatting with a random stranger.</p>`;
        }

        // Render quick message bubbles
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

    /**
     * Listens for changes to the chat document and updates the UI.
     * @param {string} chatId - The ID of the chat document.
     */
    function listenForChatChanges(chatId) {
        console.log(`Setting up listener for chat ID: ${chatId}`);
        const chatDocRef = doc(chatsCollectionRef, chatId);
        unsubscribeFromChat = onSnapshot(chatDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const chatData = docSnap.data();
                chatBox.innerHTML = ''; // Clear existing messages
                renderChatUI(chatData.commonInterests || []);

                const chatMessages = chatData.messages || [];
                chatMessages.forEach(msg => {
                    addMessage(msg.senderId, msg.text);
                });
            } else {
                // If the chat document is deleted, the chat has ended
                console.log(`Chat document ${chatId} no longer exists. Ending chat.`);
                handleChatEnded();
            }
        }, (error) => {
            console.error("Error listening to chat:", error);
            handleChatEnded();
        });
    }

    /**
     * Handles the logic for starting a new chat session.
     */
    async function startChat() {
        console.log("Start Chat button clicked.");
        if (!userId) {
            console.error("User not authenticated.");
            return;
        }

        hide(homePage);
        show(chatPage);
        chatBox.innerHTML = `<p class="text-sm text-gray-500 text-center">Searching for a stranger...</p>`;

        try {
            // First, check if the current user is already in the queue
            const currentUserInQueueDoc = await getDoc(doc(matchingCollectionRef, userId));
            if (currentUserInQueueDoc.exists()) {
                 console.log("User is already in the queue. Waiting for a match...");
                 return; // Do nothing if the user is already waiting.
            }
            
            // Look for a match in the queue
            console.log("Searching for an available match...");
            const q = query(matchingCollectionRef);
            const querySnapshot = await getDocs(q);
            let matchedUserDoc = null;
            let commonInterests = [];

            // Find the first user in the queue that is not the current user
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
                // A match was found, create a new chat document
                const newChatDoc = doc(chatsCollectionRef);
                currentChatId = newChatDoc.id;

                const chatData = {
                    users: [userId, matchedUserDoc.id],
                    commonInterests: commonInterests,
                    createdAt: serverTimestamp(),
                    messages: [{
                        senderId: 'system',
                        text: "You're now connected with a stranger. Say hello!",
                        timestamp: serverTimestamp()
                    }]
                };

                await setDoc(newChatDoc, chatData);

                // Delete both users from the matching queue
                await deleteDoc(doc(matchingCollectionRef, matchedUserDoc.id));
                listenForChatChanges(currentChatId);
                console.log(`Chat started with ${matchedUserDoc.id}. Chat ID: ${currentChatId}`);

            } else {
                console.log("No match found. Adding user to queue and listening for a match.");
                // No match found, so add the current user to the queue
                const userDocRef = doc(matchingCollectionRef, userId);
                await setDoc(userDocRef, {
                    userId: userId,
                    interests: currentInterests,
                    status: 'searching',
                    createdAt: serverTimestamp()
                });
                console.log(`User ${userId} added to matching queue.`);

                // Listen for a chat to be created for this user
                unsubscribeFromMatching = onSnapshot(query(chatsCollectionRef, where('users', 'array-contains', userId)), (querySnap) => {
                    querySnap.forEach(docSnap => {
                        const chatData = docSnap.data();
                        if (chatData.users.includes(userId)) {
                            // Match found!
                            currentChatId = docSnap.id;
                            console.log(`Matched! Chat ID: ${currentChatId}`);
                            listenForChatChanges(currentChatId);
                            // Unsubscribe from the matching queue listener
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

    /**
     * Sends a message to the active chat session.
     */
    async function sendMessage() {
        if (!currentChatId || !userId) return;

        const message = chatInput.value.trim();
        if (message) {
            const chatDocRef = doc(chatsCollectionRef, currentChatId);
            try {
                // Fetch the current messages to append the new message to.
                const chatDoc = await getDoc(chatDocRef);
                if (chatDoc.exists()) {
                    const currentMessages = chatDoc.data().messages || [];
                    await updateDoc(chatDocRef, {
                        messages: [...currentMessages, { senderId: userId, text: message, timestamp: serverTimestamp() }]
                    });
                    chatInput.value = '';
                }
            } catch (error) {
                console.error("Error sending message:", error);
            }
        }
    }

    /**
     * Ends the current chat session by deleting the chat document.
     */
    async function endChat() {
        if (!currentChatId) {
            handleChatEnded();
            return;
        }

        try {
            await deleteDoc(doc(chatsCollectionRef, currentChatId));
            console.log(`Chat ${currentChatId} ended by user.`);
        } catch (error) {
            console.error("Error ending chat:", error);
        }
        handleChatEnded();
    }

    /**
     * Resets the UI and state after a chat has ended.
     */
    function handleChatEnded() {
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
    }

    // --- Event Handlers ---
    function handleInterestInput(e) {
        // FIX: Using keyup and a more robust check for input value to create bubbles.
        console.log("Interest field keyup event fired. Key:", e.key);
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const interest = interestInputField.value.trim().toLowerCase();
            if (interest && interest !== '' && !currentInterests.includes(interest)) {
                currentInterests.push(interest);
                saveInterests(currentInterests);
                console.log("Interest added:", interest);
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
    nextBtn.addEventListener('click', handleChatEnded);

    // Initial setup on page load
    currentInterests = loadInterests();
    renderInterests();
});
