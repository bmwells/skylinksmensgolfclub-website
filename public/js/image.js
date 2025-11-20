// Image configuration
const imageConfig = {
    hero: '/images/p1.webp',
    welcome: '/images/p2.webp',
    tournament1: '/images/p3.webp',
    tournament2: '/images/p4.webp',
    tournament3: '/images/p5.webp',
    instagram: '/images/p2.webp'
};

// Function to update all images
function updateAllImages() {
    document.documentElement.style.setProperty('--hero-image', `url('${imageConfig.hero}')`);
    document.documentElement.style.setProperty('--welcome-image', `url('${imageConfig.welcome}')`);
    document.documentElement.style.setProperty('--tournament-image1', `url('${imageConfig.tournament1}')`);
    document.documentElement.style.setProperty('--tournament-image2', `url('${imageConfig.tournament2}')`);
    document.documentElement.style.setProperty('--tournament-image3', `url('${imageConfig.tournament3}')`);
    document.documentElement.style.setProperty('--instagram-image', `url('${imageConfig.instagram}')`);
}

// Initialize images when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    updateAllImages();
});