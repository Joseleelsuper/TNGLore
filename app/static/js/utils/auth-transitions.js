document.addEventListener('DOMContentLoaded', () => {
    const switchButtons = document.querySelectorAll('.switch-form');
    
    switchButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = e.target.dataset.target;
            switchSection(targetSection);
        });
    });
});

function switchSection(targetSection) {
    const currentSection = document.querySelector('section.active');
    const targetSectionElement = document.querySelector(`#${targetSection}-section`);
    
    currentSection.classList.add('inactive');
    currentSection.classList.remove('active');
    
    targetSectionElement.classList.add('active');
    targetSectionElement.classList.remove('inactive');
}