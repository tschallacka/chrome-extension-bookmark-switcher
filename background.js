/**
 * @typedef {Object} Runtime
 * @property {Object} onInstalled - The event fired when the extension is installed
 * @property {function(function(): void): void} onInstalled.addListener - Method to register an install callback
 */

/**
 * @type {Runtime}
 */
chrome.runtime;


chrome.runtime.onInstalled.addListener(() => {
    console.log("Bookmark Folder Switcher installed.");
});