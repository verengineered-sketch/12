// Client‑side script to drive the recipe web application.
document.addEventListener('DOMContentLoaded', () => {
  const searchView = document.getElementById('search-view');
  const miseView = document.getElementById('mise-view');
  const stepsView = document.getElementById('steps-view');
  const loadBtn = document.getElementById('load-btn');
  const errorMsg = document.getElementById('error-msg');
  const recipeUrlInput = document.getElementById('recipe-url');
  const recipeTitle = document.getElementById('recipe-title');
  const ingredientsList = document.getElementById('ingredients-list');
  const checkAllBtn = document.getElementById('check-all-btn');
  const startCookingBtn = document.getElementById('start-cooking-btn');
  const stepHeader = document.getElementById('step-header');
  const stepText = document.getElementById('step-text');
  const backBtn = document.getElementById('back-btn');
  const repeatBtn = document.getElementById('repeat-btn');
  const nextBtn = document.getElementById('next-btn');
  const timersContainer = document.getElementById('timers');
  // State
  let recipe = null;
  let checked = new Set();
  let currentIndex = 0;
  const timers = {};
  // Voice recognition setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
  }

  loadBtn.addEventListener('click', async () => {
    errorMsg.textContent = '';
    const url = recipeUrlInput.value.trim();
    if (!url) {
      errorMsg.textContent = 'Please enter a URL.';
      return;
    }
    loadBtn.disabled = true;
    try {
      const res = await fetch(`/api/recipe?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      recipe = data;
      showMiseView();
    } catch (err) {
      errorMsg.textContent = err.message;
    } finally {
      loadBtn.disabled = false;
    }
  });

  function showMiseView() {
    searchView.classList.add('hidden');
    miseView.classList.remove('hidden');
    recipeTitle.textContent = recipe.title;
    ingredientsList.innerHTML = '';
    checked.clear();
    recipe.ingredients.forEach((ing, idx) => {
      const li = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) checked.add(idx); else checked.delete(idx);
      });
      const span = document.createElement('span');
      span.textContent = ing;
      li.appendChild(checkbox);
      li.appendChild(span);
      ingredientsList.appendChild(li);
    });
    checkAllBtn.textContent = 'Check All';
  }

  checkAllBtn.addEventListener('click', () => {
    const checkboxes = ingredientsList.querySelectorAll('input[type="checkbox"]');
    if (checked.size === recipe.ingredients.length) {
      checkboxes.forEach(cb => cb.checked = false);
      checked.clear();
      checkAllBtn.textContent = 'Check All';
    } else {
      checkboxes.forEach(cb => cb.checked = true);
      recipe.ingredients.forEach((_, idx) => checked.add(idx));
      checkAllBtn.textContent = 'Uncheck All';
    }
  });

  startCookingBtn.addEventListener('click', () => {
    miseView.classList.add('hidden');
    stepsView.classList.remove('hidden');
    currentIndex = 0;
    updateStepView();
    startVoiceRecognition();
    speakCurrentStep();
  });

  backBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      updateStepView();
      speakCurrentStep();
    }
  });
  repeatBtn.addEventListener('click', speakCurrentStep);
  nextBtn.addEventListener('click', () => {
    handleNextStep();
  });

  function updateStepView() {
    stepHeader.textContent = `Step ${currentIndex + 1} of ${recipe.steps.length}`;
    stepText.textContent = recipe.steps[currentIndex];
    // Hide back button on first step and change next to Finish on last
    backBtn.disabled = currentIndex === 0;
    nextBtn.textContent = currentIndex === recipe.steps.length - 1 ? 'Finish' : 'Next';
  }

  function speak(text) {
    const utter = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utter);
  }
  function speakCurrentStep() {
    speak(recipe.steps[currentIndex]);
  }

  function startVoiceRecognition() {
    if (!recognition) return;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ')
        .toLowerCase();
      if (transcript.includes('next')) {
        handleNextStep();
      } else if (transcript.includes('back')) {
        if (currentIndex > 0) {
          currentIndex--;
          updateStepView();
          speakCurrentStep();
        }
      } else if (transcript.includes('repeat')) {
        speakCurrentStep();
      } else if (transcript.includes('finish')) {
        const label = transcript.replace('finish', '').trim();
        finishTimer(label);
      }
    };
    recognition.onend = () => {
      // restart recognition for continuous listening
      recognition.start();
    };
    recognition.start();
  }

  function handleNextStep() {
    // Start timer for current step before moving to the next
    createTimerForStep(currentIndex, recipe.steps[currentIndex]);
    if (currentIndex < recipe.steps.length - 1) {
      currentIndex++;
      updateStepView();
      speakCurrentStep();
    } else {
      speak('Recipe complete. Enjoy your meal.');
      stopVoiceRecognition();
    }
  }

  function stopVoiceRecognition() {
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
    }
  }

  // Timer management
  function parseDuration(text) {
    const lower = text.toLowerCase();
    // Patterns: hours, minutes, seconds
    const hourMatch = lower.match(/(\d+)\s*hour/);
    if (hourMatch) return parseInt(hourMatch[1], 10) * 3600;
    const minMatch = lower.match(/(\d+)\s*minute/);
    if (minMatch) return parseInt(minMatch[1], 10) * 60;
    const secMatch = lower.match(/(\d+)\s*second/);
    if (secMatch) return parseInt(secMatch[1], 10);
    return null;
  }

  function createTimerForStep(stepIndex, stepText) {
    if (timers[stepIndex]) return;
    const duration = parseDuration(stepText);
    if (!duration) return;
    const label = stepText.length > 30 ? stepText.slice(0, 30) + '…' : stepText;
    const timer = {
      id: stepIndex,
      label,
      remaining: duration,
      intervalId: null,
    };
    timers[stepIndex] = timer;
    updateTimersUI();
    timer.intervalId = setInterval(() => {
      timer.remaining--;
      updateTimersUI();
      if (timer.remaining <= 0) {
        clearInterval(timer.intervalId);
        delete timers[stepIndex];
        updateTimersUI();
        speak(`Timer for ${label} is done.`);
      }
    }, 1000);
  }

  function updateTimersUI() {
    const entries = Object.values(timers);
    if (entries.length === 0) {
      timersContainer.classList.add('hidden');
      timersContainer.innerHTML = '';
      return;
    }
    timersContainer.classList.remove('hidden');
    timersContainer.innerHTML = '';
    entries.forEach(timer => {
      const div = document.createElement('div');
      div.className = 'timer-item';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = `${timer.label} (${formatTime(timer.remaining)})`;
      const finishBtn = document.createElement('button');
      finishBtn.textContent = 'Finish';
      finishBtn.style.background = '#2563eb';
      finishBtn.style.color = 'white';
      finishBtn.style.border = 'none';
      finishBtn.style.borderRadius = '4px';
      finishBtn.style.padding = '0.25rem 0.5rem';
      finishBtn.addEventListener('click', () => finishTimer(timer.label));
      div.appendChild(labelSpan);
      div.appendChild(finishBtn);
      timersContainer.appendChild(div);
    });
  }

  function finishTimer(label) {
    const entry = Object.values(timers).find(t => t.label.toLowerCase().includes(label.toLowerCase()));
    if (entry) {
      clearInterval(entry.intervalId);
      delete timers[entry.id];
      updateTimersUI();
    }
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }
});