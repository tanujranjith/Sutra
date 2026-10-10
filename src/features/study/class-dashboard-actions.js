(function () {
  'use strict';

  let openWrapped = false;

  function getDrawer() {
    return document.getElementById('classDashboardDrawer');
  }

  function getCourseId(drawer) {
    const explicitId = String(drawer && drawer.getAttribute('data-sutra-course-id') || '').trim();
    if (explicitId) return explicitId;

    const title = drawer && drawer.querySelector('.class-dash-head h3');
    const name = String(title && title.textContent || '').trim().toLowerCase();
    if (!name || !window.SutraHomework || typeof window.SutraHomework.getCourses !== 'function') return '';
    const match = window.SutraHomework.getCourses().find(course => String(course.name || '').trim().toLowerCase() === name);
    return match ? String(match.id) : '';
  }

  function openCourseSettings(courseId) {
    const id = String(courseId || '').trim();
    if (!id || typeof window.setActiveView !== 'function'
      || typeof window.cwSelectCourse !== 'function' || typeof window.cwSetCourseTab !== 'function') {
      if (typeof window.showToast === 'function') window.showToast('Course settings are unavailable.');
      return false;
    }
    if (typeof window.closeClassDashboardDrawer === 'function') window.closeClassDashboardDrawer();
    window.setActiveView('courses', { allowDisabled: true });
    window.cwSelectCourse(id);
    window.cwSetCourseTab('settings');
    const nameInput = document.querySelector('#courseHubMount [data-cs="name"]');
    if (nameInput) nameInput.focus({ preventScroll: true });
    return true;
  }

  function enhanceDrawer() {
    const drawer = getDrawer();
    if (!drawer || !drawer.classList.contains('active')) return;
    const footer = drawer.querySelector('.class-dash-actions');
    if (!footer || footer.querySelector('[data-class-dashboard-remove]')) return;

    const courseId = getCourseId(drawer);
    if (!courseId || !window.SutraHomework || typeof window.SutraHomework.getCourses !== 'function') return;
    const course = window.SutraHomework.getCourses().find(item => String(item.id) === courseId);
    if (!course) return;

    const kindLabel = course.type === 'misc' ? 'activity' : 'class';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'neumo-btn class-dash-edit';
    editButton.setAttribute('data-class-dashboard-edit', courseId);
    editButton.textContent = `Edit ${kindLabel}`;
    editButton.addEventListener('click', () => openCourseSettings(courseId));
    const startFocusButton = footer.querySelector('.class-dash-primary');
    if (startFocusButton) footer.insertBefore(editButton, startFocusButton.nextSibling);
    else footer.appendChild(editButton);

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'classDashDeleteBtn';
    button.className = 'neumo-btn class-dash-danger';
    button.setAttribute('data-class-dashboard-remove', courseId);
    button.textContent = `Remove ${kindLabel}`;
    button.addEventListener('click', async () => {
      if (!window.SutraHomework || typeof window.SutraHomework.removeCourse !== 'function') return;
      button.disabled = true;
      try {
        const removed = await window.SutraHomework.removeCourse(courseId);
        if (removed && typeof window.closeClassDashboardDrawer === 'function') {
          window.closeClassDashboardDrawer();
        }
      } finally {
        if (drawer.classList.contains('active')) button.disabled = false;
      }
    });
    footer.appendChild(button);
  }

  function bind() {
    const drawer = getDrawer();
    const body = drawer && drawer.querySelector('.class-dashboard-body');
    if (!drawer || !body || drawer.dataset.dashboardRemovalBound === 'true') return;
    drawer.dataset.dashboardRemovalBound = 'true';

    const originalOpen = window.openClassDashboardDrawer;
    if (typeof originalOpen === 'function' && !openWrapped) {
      openWrapped = true;
      window.openClassDashboardDrawer = function (courseId) {
        drawer.setAttribute('data-sutra-course-id', String(courseId || ''));
        return originalOpen.apply(this, arguments);
      };
    }

    const observer = new MutationObserver(enhanceDrawer);
    observer.observe(body, { childList: true, subtree: true });
    enhanceDrawer();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
}());
