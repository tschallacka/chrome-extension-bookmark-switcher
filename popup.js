document.addEventListener("DOMContentLoaded", async () => {
    const listElement = document.getElementById("folder-list");
    const searchInput = document.getElementById("search");
    const promptContainer = document.getElementById("prompt-container");
    const hotbarInput = document.getElementById("hotbar-name");
    const saveHotbarNameButton = document.getElementById("save-hotbar-name");
    const addNewSetButton = document.getElementById("add-new-set");
    const createFromSearchContainer = document.getElementById("create-from-search");
    const createSearchSetButton = document.getElementById("create-search-set");


    let otherBookmarksId = null;

    // Get the "Other Bookmarks" folder
    async function getOtherBookmarks() {
        const tree = await chrome.bookmarks.getTree();
        const otherBookmarks = findFolder(tree[0], "Other bookmarks");
        otherBookmarksId = otherBookmarks?.id || null;
        return otherBookmarks?.children || [];
    }


    // Add this to your DOMContentLoaded event listener in popup.js

// Add a keydown event listener to capture typing when popup is active
    document.addEventListener("keydown", (event) => {
        // Skip if the event target is already an input or if special keys are pressed
        if (
            event.target.tagName === "INPUT" ||
            event.target.tagName === "TEXTAREA" ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey
        ) {
            return;
        }

        // Only handle printable characters
        // This allows single-character keys that produce output
        if (event.key.length === 1) {
            // Append the character to search input without changing focus
            searchInput.value += event.key;

            // Manually trigger the input event to update search results
            searchInput.dispatchEvent(new Event('input'));

            // Prevent default behavior (like scrolling with space)
            event.preventDefault();
        } else if (event.key === "Backspace") {
            // Handle backspace key to delete the last character
            searchInput.value = searchInput.value.slice(0, -1);
            searchInput.dispatchEvent(new Event('input'));
            event.preventDefault();
        }
    });


    // Search and highlight function similar to PhpStorm
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase().trim();
        const items = listElement.querySelectorAll(".folder-item");

        // If query is empty, show all items and reset highlights
        if (query === "") {
            items.forEach(item => {
                item.style.display = "";
                item.innerHTML = item.textContent; // Reset any highlighting
            });
            return;
        }

        // Store matched items with their scores for sorting
        const matchedItems = [];

        items.forEach(item => {
            const text = item.textContent;
            const lowerText = text.toLowerCase();

            // Check if text contains the query
            if (lowerText.includes(query)) {
                createFromSearchContainer.style.display = "none";
                // Full continuous match - highest score (10000 + text length for stable sort)
                const score = 10000 + text.length;
                const highlightedText = highlightContinuousMatch(text, query);

                matchedItems.push({
                    element: item,
                    score: score,
                    highlightedText: highlightedText
                });
            } else {
                // Check for separated matches (characters in order)
                const matchResult = checkSeparatedMatch(text, query);
                if (matchResult.matched) {
                    createFromSearchContainer.style.display = "none";
                    // Separated match - score based on compactness (lower is better)
                    // We add the total distance between matches to penalize very dispersed matches
                    const score = 1000 - matchResult.totalDistance;

                    matchedItems.push({
                        element: item,
                        score: score,
                        highlightedText: matchResult.highlightedText
                    });
                } else {
                    createFromSearchContainer.style.display = "block";

                    // No match
                    item.style.display = "none";
                }
            }
        });

        // Sort matched items by score (higher is better)
        matchedItems.sort((a, b) => b.score - a.score);

        // Update display and highlighting
        matchedItems.forEach((matchedItem, index) => {
            const item = matchedItem.element;
            item.style.display = "";
            item.innerHTML = matchedItem.highlightedText;

            // Optional: adjust position in DOM to match sort order
            item.parentNode.appendChild(item);
        });

        // Hide unmatched items
        items.forEach(item => {
            if (!matchedItems.some(match => match.element === item)) {
                item.style.display = "none";
            }
        });
    });

    // Add event listener for the "Add New Set" button
    addNewSetButton.addEventListener("click", () => {
        hotbarInput.value = ""; // Clear the input field
        promptContainer.style.display = "block"; // Show the prompt
        hotbarInput.focus(); // Focus the input field
    });

    // Add event listener for the "Create new set?" button from search
    createSearchSetButton.addEventListener("click", () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            hotbarInput.value = searchTerm; // Prefill with search term
            promptContainer.style.display = "block";
            hotbarInput.focus();
        }
    });

    // Modify the save button event listener to handle both scenarios
    saveHotbarNameButton.addEventListener("click", async () => {
        const folderName = hotbarInput.value.trim();
        if (folderName) {
            await createNewBookmarkSet(folderName);
            promptContainer.style.display = "none"; // Hide the prompt
            createFromSearchContainer.style.display = "none"; // Hide the create from search container
        }
    });

    hotbarInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            const folderName = hotbarInput.value.trim();
            if (folderName) {
                await createNewBookmarkSet(folderName);
                promptContainer.style.display = "none"; // Hide the prompt
                createFromSearchContainer.style.display = "none"; // Hide the create from search container
            }
        }
    });

// Function to highlight continuous matches
    function highlightContinuousMatch(text, query) {
        const lowerText = text.toLowerCase();
        const startIndex = lowerText.indexOf(query.toLowerCase());

        if (startIndex >= 0) {
            const endIndex = startIndex + query.length;
            return (
                text.substring(0, startIndex) +
                '<span class="highlight">' +
                text.substring(startIndex, endIndex) +
                '</span>' +
                text.substring(endIndex)
            );
        }

        return text;
    }


// Improved function to check and highlight separated matches
    function checkSeparatedMatch(text, query) {
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();

        let result = {
            matched: false,
            highlightedText: text,
            totalDistance: 0
        };

        // First, try to find continuous segments of the query
        let segments = [];
        let currentSegment = "";
        let lastMatchIndex = -1;
        let queryIndex = 0;

        // Find longest possible segments in order
        while (queryIndex < lowerQuery.length) {
            let longestSegment = "";
            let bestMatchIndex = -1;

            // Try to find the longest segment starting from current queryIndex
            for (let segmentLength = lowerQuery.length - queryIndex; segmentLength > 0; segmentLength--) {
                const segment = lowerQuery.substr(queryIndex, segmentLength);
                const segmentIndex = lowerText.indexOf(segment, lastMatchIndex + 1);

                if (segmentIndex !== -1) {
                    longestSegment = segment;
                    bestMatchIndex = segmentIndex;
                    break;
                }
            }

            if (longestSegment) {
                segments.push({
                    text: longestSegment,
                    index: bestMatchIndex
                });

                queryIndex += longestSegment.length;
                lastMatchIndex = bestMatchIndex + longestSegment.length - 1;
            } else {
                // No segment found, can't match the query
                return result;
            }
        }

        // Calculate total distance between matched segments
        for (let i = 1; i < segments.length; i++) {
            result.totalDistance += segments[i].index - (segments[i-1].index + segments[i-1].text.length);
        }

        // Create highlighted text
        let highlightedText = '';
        let lastIndex = 0;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            highlightedText += text.substring(lastIndex, segment.index);
            highlightedText += '<span class="highlight">' + text.substr(segment.index, segment.text.length) + '</span>';
            lastIndex = segment.index + segment.text.length;
        }

        highlightedText += text.substring(lastIndex);

        return {
            matched: true,
            highlightedText: highlightedText,
            totalDistance: result.totalDistance
        };
    }
    listElement.addEventListener("click", async event => {
        if (event.target.tagName === "LI") {
            const selectedId = event.target.dataset.id; // ID of the clicked folder
            const currentHotbarName = (await chrome.storage.local.get("currentHotbarName")).currentHotbarName;

            /** This will only run on the first time the extension is used, or data has been cleared. **/
            if (!currentHotbarName) {
                // Prompt the user to set a name for the hotbar
                promptContainer.style.display = "block";
                saveHotbarNameButton.addEventListener("click", async () => {
                    const name = hotbarInput.value.trim();
                    if (name) {
                        await chrome.storage.local.set({ currentHotbarName: name });
                        promptContainer.style.display = "none";
                        await swapBookmarks(selectedId, name); // Perform the swap after setting the name
                    }
                });
            } else {
                // Directly perform the swap using the stored hotbar name
                await swapBookmarks(selectedId, currentHotbarName);
            }
        }
    });

    function transitionFolders(previousActiveId, newActiveId) {
        // Get the elements
        const folderListElement = document.getElementById('folder-list');
        const previousActiveItem = previousActiveId
            ? folderListElement.querySelector(`.folder-item[data-folder-id="${previousActiveId}"]`)
            : null;
        const newActiveItem = folderListElement.querySelector(
            `.folder-item[data-folder-id="${newActiveId}"]`
        );

        if (!newActiveItem) return; // Safety check

        // Animation duration
        const duration = 300;

        // Step 1: Capture initial positions before any changes
        const newItemInitialRect = newActiveItem.getBoundingClientRect();
        const newItemInitialTop = newItemInitialRect.top;

        let prevItemInitialRect = null;
        let prevItemInitialTop = null;

        if (previousActiveItem) {
            prevItemInitialRect = previousActiveItem.getBoundingClientRect();
            prevItemInitialTop = prevItemInitialRect.top;
        }

        // Step 2: Mark the new item as "will-be-active" but don't move it yet
        newActiveItem.classList.add('will-be-active');

        // Step 3: Change the style of the previously active item but don't remove active class yet
        if (previousActiveItem) {
            previousActiveItem.classList.add('will-be-inactive');
        }

        // Step 4: Wait a small delay for visual changes to start
        setTimeout(() => {
            // Step 5: Make the actual DOM changes
            if (previousActiveItem) {
                previousActiveItem.classList.remove('active', 'will-be-inactive');
            }

            newActiveItem.classList.remove('will-be-active');
            newActiveItem.classList.add('active');

            // Step 6: Get the new positions after DOM changes
            const newItemFinalRect = newActiveItem.getBoundingClientRect();
            const newItemFinalTop = newItemFinalRect.top;

            let prevItemFinalRect = null;
            let prevItemFinalTop = null;

            if (previousActiveItem) {
                prevItemFinalRect = previousActiveItem.getBoundingClientRect();
                prevItemFinalTop = prevItemFinalRect.top;
            }

            // Step 7: Calculate the distances moved
            const newItemMoveDistance = newItemInitialTop - newItemFinalTop;
            let prevItemMoveDistance = 0;

            if (previousActiveItem) {
                prevItemMoveDistance = prevItemInitialTop - prevItemFinalTop;
            }

            // Step 8: Apply transforms to put elements visually back where they started
            if (Math.abs(newItemMoveDistance) > 0) {
                newActiveItem.style.transform = `translateY(${newItemMoveDistance}px)`;
                newActiveItem.style.transition = 'none';
            }

            if (previousActiveItem && Math.abs(prevItemMoveDistance) > 0) {
                previousActiveItem.style.transform = `translateY(${prevItemMoveDistance}px)`;
                previousActiveItem.style.transition = 'none';
            }

            // Force a reflow
            if (Math.abs(newItemMoveDistance) > 0 || (previousActiveItem && Math.abs(prevItemMoveDistance) > 0)) {
                folderListElement.offsetHeight;
            }

            // Step 9: Animate to final positions
            if (Math.abs(newItemMoveDistance) > 0) {
                newActiveItem.style.transition = `transform ${duration}ms ease-out`;
                newActiveItem.style.transform = 'translateY(0)';
            }

            if (previousActiveItem && Math.abs(prevItemMoveDistance) > 0) {
                previousActiveItem.style.transition = `transform ${duration}ms ease-out`;
                previousActiveItem.style.transform = 'translateY(0)';
            }

            // Step 10: Clean up after animation completes
            setTimeout(() => {
                newActiveItem.style.transition = '';
                newActiveItem.style.transform = '';

                if (previousActiveItem) {
                    previousActiveItem.style.transition = '';
                    previousActiveItem.style.transform = '';
                }
            }, duration);

        }, 50); // Small delay to let the style transitions start
    }

    async function swapBookmarks(selectedFolderId, hotbarName) {
        try {
            const bookmarksBar = await getHotbarBookmarksBar();
            if (!bookmarksBar) {
                console.error("Couldn't find the Bookmarks Bar");
                return;
            }

            // Step 1: Check if the selected folder is already active
            const { currentActiveFolderId } = await chrome.storage.local.get("currentActiveFolderId");
            if (currentActiveFolderId === selectedFolderId) {
                console.log("The selected folder is already active. No changes made.");
                return; // Prevent any operations when the folder is already active
            }

            // Step 2: Save current hotbar items back to their original folder
            const hotbarItems = await chrome.bookmarks.getChildren(bookmarksBar.id);

            if (hotbarItems.length > 0 && currentActiveFolderId) {
                // We have a current active folder ID and items to move back
                for (const item of hotbarItems) {
                    await chrome.bookmarks.move(item.id, { parentId: currentActiveFolderId });
                }
            }

            // Step 3: Move items from the selected folder to the hotbar
            const selectedFolderItems = await chrome.bookmarks.getChildren(selectedFolderId);
            for (const item of selectedFolderItems) {
                await chrome.bookmarks.move(item.id, { parentId: bookmarksBar.id });
            }

            // Step 4: Update the active folder in storage using the ID
            const selectedFolder = (await chrome.bookmarks.get(selectedFolderId))[0];
            await chrome.storage.local.set({
                currentHotbarName: selectedFolder.title,
                currentActiveFolderId: selectedFolderId
            });

            // Update last accessed timestamp for this folder
            await updateFolderAccessTime(selectedFolderId);

            console.log(`Hotbar successfully updated with the contents of folder: ${selectedFolder.title}`);

            // Step 5: Start the transition animation and then refresh the folder list
            await transitionFolders(currentActiveFolderId, selectedFolderId);
            await populateFolders();

        } catch (error) {
            console.error("Error in swapBookmarks:", error);
        }
    }

    // Modified populateFolders function that handles hotbar item correctly
    async function populateFolders() {
        try {
            const folderListElement = document.getElementById('folder-list');

            // Get folders from "Other Bookmarks"
            const otherBookmarksFolder = await getOtherBookmarksFolder();
            const folders = await chrome.bookmarks.getChildren(otherBookmarksFolder.id);

            // Get the current active folder information
            const { currentActiveFolderId, currentActiveFolderName, folderAccessTimes = {} } =
                await chrome.storage.local.get(['currentActiveFolderId', 'currentActiveFolderName', 'folderAccessTimes']);

            // Create a combined list including the active folder (which may be in the hotbar)
            let allFolders = [...folders];

            // Check if active folder exists in the list, if not, create a virtual entry for it
            const activeExists = folders.some(folder => folder.id === currentActiveFolderId);
            if (currentActiveFolderId && currentActiveFolderName && !activeExists) {
                // Add the active folder as a virtual entry
                allFolders.push({
                    id: currentActiveFolderId,
                    title: currentActiveFolderName,
                    isVirtual: true  // Mark as virtual to indicate it's not physically in this folder
                });
            }

            // Sort folders: active first, then by last accessed time (most recent first)
            allFolders.sort((a, b) => {
                // Active folder always comes first
                if (a.id === currentActiveFolderId) return -1;
                if (b.id === currentActiveFolderId) return 1;

                // Sort by access time (most recent first)
                const timeA = folderAccessTimes[a.id] || 0;
                const timeB = folderAccessTimes[b.id] || 0;
                return timeB - timeA;
            });

            // Get existing folder items
            const existingItems = {};
            folderListElement.querySelectorAll('.folder-item').forEach(item => {
                const folderId = item.dataset.folderId;
                if (folderId) {
                    existingItems[folderId] = item;
                }
            });

            // Create a new fragment to build our updated list
            const fragment = document.createDocumentFragment();

            // Create or reuse folder items in the UI
            allFolders.forEach(folder => {
                let folderItem;

                // If we already have this folder item, reuse it
                if (existingItems[folder.id]) {
                    folderItem = existingItems[folder.id];

                    // Make sure the text content is up to date
                    if (folderItem.textContent !== folder.title) {
                        folderItem.textContent = folder.title;
                    }
                } else {
                    // Create a new folder item following the original pattern
                    folderItem = document.createElement('div');
                    folderItem.className = 'folder-item';
                    folderItem.textContent = folder.title;
                    folderItem.dataset.folderId = folder.id;
                    folderItem.addEventListener('click', () => {
                        swapBookmarks(folder.id, folder.title);
                    });
                }

                // Update active state
                if (folder.id === currentActiveFolderId) {
                    folderItem.classList.add('active');
                } else {
                    folderItem.classList.remove('active');
                }

                // Add a special class for the hotbar item if it's virtual
                if (folder.isVirtual) {
                    folderItem.classList.add('hotbar-reference');
                } else {
                    folderItem.classList.remove('hotbar-reference');
                }

                fragment.appendChild(folderItem);
            });

            // Clear the list and add our new/reused items
            folderListElement.innerHTML = '';
            folderListElement.appendChild(fragment);

        } catch (error) {
            console.error("Error populating folders:", error);
        }
    }

    // Function to create a new bookmark set
    async function createNewBookmarkSet(folderName) {
        try {
            // Get the Other Bookmarks folder
            const otherBookmarksFolder = await getOtherBookmarksFolder();

            // Create a new folder in Other Bookmarks
            const newFolder = await chrome.bookmarks.create({
                parentId: otherBookmarksFolder.id,
                title: folderName
            });

            // After creating, update the display and select the new folder
            await populateFolders();
            await swapBookmarks(newFolder.id, newFolder.title);

            return newFolder;
        } catch (error) {
            console.error("Error creating new bookmark set:", error);
            return null;
        }
    }


    // Helper function to update the last accessed timestamp for a folder
    async function updateFolderAccessTime(folderId) {
        // Get current timestamps
        const { folderAccessTimes = {} } = await chrome.storage.local.get('folderAccessTimes');

        // Update timestamp for this folder
        folderAccessTimes[folderId] = Date.now();

        // Save updated timestamps
        await chrome.storage.local.set({ folderAccessTimes });
    }


    // Helper to get "Other Bookmarks" folder
    async function getOtherBookmarksFolder() {
        const tree = await chrome.bookmarks.getTree();
        // Find "Other Bookmarks" - its position can vary by browser
        const otherBookmarks = tree[0].children.find(node =>
            node.title === "Other bookmarks" || node.title === "Other Bookmarks"
        );
        return otherBookmarks;
    }

// Helper to get "Bookmarks Bar" folder
    async function getHotbarBookmarksBar() {
        const tree = await chrome.bookmarks.getTree();
        // Find "Bookmarks Bar" - its position can vary by browser
        const bookmarksBar = tree[0].children.find(node =>
            node.title === "Bookmarks bar" || node.title === "Bookmarks Bar"
        );
        return bookmarksBar;
    }


    function findFolder(node, title) {
        if (node.title === title) return node;
        if (node.children) {
            for (let child of node.children) {
                const result = findFolder(child, title);
                if (result) return result;
            }
        }
        return null;
    }





    async function initializeFolderAccessTimes() {
        const { folderAccessTimes = {} } = await chrome.storage.local.get('folderAccessTimes');
        const otherBookmarksFolder = await getOtherBookmarksFolder();
        const folders = await chrome.bookmarks.getChildren(otherBookmarksFolder.id);

        let updated = false;
        folders.forEach(folder => {
            if (!folderAccessTimes[folder.id]) {
                folderAccessTimes[folder.id] = 0; // Default timestamp
                updated = true;
            }
        });

        if (updated) {
            await chrome.storage.local.set({ folderAccessTimes });
        }
    }

    async function cleanupFolderAccessTimes() {
        const { folderAccessTimes = {} } = await chrome.storage.local.get('folderAccessTimes');
        const otherBookmarksFolder = await getOtherBookmarksFolder();
        const folders = await chrome.bookmarks.getChildren(otherBookmarksFolder.id);

        const validFolderIds = folders.map(f => f.id);
        let updated = false;

        Object.keys(folderAccessTimes).forEach(folderId => {
            if (!validFolderIds.includes(folderId)) {
                delete folderAccessTimes[folderId];
                updated = true;
            }
        });

        if (updated) {
            await chrome.storage.local.set({ folderAccessTimes });
        }
    }

    await populateFolders();
});