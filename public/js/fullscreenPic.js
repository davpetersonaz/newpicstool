//public/js/fullscreenPic.js
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('fullscreen-modal');
    const modalImg = document.getElementById('fullscreen-image');
    const closeBtn = document.getElementById('close-modal');
    const galleryImages = document.querySelectorAll('.gallery-image');

    // Open modal when an image is clicked
    galleryImages.forEach(image => {
        image.addEventListener('click', () => {
            modal.style.display = 'block';
            modalImg.src = image.src;
            modalImg.alt = image.alt;
        });
    });

    // Close modal when the close button is clicked
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close modal when clicking outside the image
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});