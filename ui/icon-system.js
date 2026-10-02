(function(){
  'use strict';
  const paths={
    home:'<path d="M3 10.8 12 3l9 7.8v9.2a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="M9 21v-6h6v6"/>',
    friends:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.09h-4v-.09a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.09a1.7 1.7 0 0 0 1.51-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.09v4H21a1.7 1.7 0 0 0-1.6.6z"/>',
    logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9 1 1-2 2 2 2-3 3-2-2-2 2"/>',
    play:'<path d="m8 5 11 7-11 7z"/>',
    eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    fullscreen:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    chat:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-6a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4z"/>',
    invite:'<path d="M15 19a6 6 0 0 0-12 0"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M17 11h6"/>',
    search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    music:'<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    screen:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    back:'<path d="m15 18-6-6 6-6"/>',
    crown:'<path d="m3 7 4 4 5-7 5 7 4-4-2 11H5z"/>',
    wifi:'<path d="M5 12.55a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 20h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    filter:'<path d="M4 5h16M7 12h10M10 19h4"/>',
    spark:'<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z"/><path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/>',
    volume:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
    shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/>',
    monitor:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    warning:'<path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
  };
  function svg(name,cls=''){
    const body=paths[name]||paths.spark;
    return `<svg class="tdb-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  window.TDBIcons={svg};
})();
