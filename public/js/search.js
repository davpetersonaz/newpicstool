//public/js/search.js

// Optional: Add live search with fetch API
document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = e.target.q.value;
    const res = await fetch(`/search?q=${query}`);
    // Handle response (e.g., update gallery dynamically)
});