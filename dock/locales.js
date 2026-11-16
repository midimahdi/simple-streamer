/**
 * Simple Streamer — Localization Dictionaries & Engine (i18n)
 * Lightweight, zero-dependency client-side localization for embedded OBS docks and mobile remote.
 */

export const I18N = {
  en: {
    dir: 'ltr',
    langName: 'English',

    // Header & Top Bar
    brandTitle: 'SIMPLE STREAMER',
    settingsTitle: 'SETTINGS',
    signIn: 'Sign In',
    freeBadge: 'FREE',
    proBadge: '⭐ PRO',
    foundingBadge: '🔥 FOUNDING',
    toggleSettingsTip: 'Platform Settings & Connections',
    backToAppTip: 'Back to Simple Streamer',
    updateAvailable: 'Update available: <strong>v{version}</strong>',
    btnUpdate: 'Update',
    alertTitle: 'ALERT',
    signedInSuccessTitle: '✓ SIGNED IN',

    // Active Live Container & Metrics
    broadcastingLive: '● BROADCASTING LIVE',
    metricBitrate: 'BITRATE',
    metricFps: 'FPS',
    metricDropped: 'DROPPED',
    metricStatus: 'STATUS',
    statusOnline: 'ONLINE',

    // Main Inputs
    titleLabel: 'Title',
    titlePlaceholder: 'Add a title to your video',
    descLabel: 'Description',
    descPlaceholder: 'Tell viewers about your video',
    thumbLabel: 'Thumbnail (Optional)',
    thumbClear: '✕ CLEAR',
    thumbPrompt: 'Click or drop 16:9 thumbnail',
    thumbSub: 'Auto-compressed to 720p (<200KB)',
    targetsTitle: 'BROADCAST TARGETS',

    // Presets Dropdown
    presetsHeader: '📋 Presets...',
    newPreset: '+ New Preset...',
    savePresetTo: '💾 Save changes to "{name}"',
    deletePreset: '🗑️ Delete a Preset...',
    syncPresetsCloud: '☁️ Sync Presets with Cloud',

    // Action Button
    startBroadcast: '▶ START BROADCAST',
    endBroadcast: '⏹ STOP STREAM',
    startingBroadcast: '⏳ PREPARING STREAM...',
    stoppingBroadcast: '⏳ ENDING STREAM...',
    connectingObs: '⏳ CONNECTING TO OBS...',
    selectDestFirst: 'SELECT DESTINATION FIRST',
    destError: 'DESTINATION ERROR - CHECK SETTINGS',

    // Settings Drawer - Account
    accountPassTitle: 'ACCOUNT & LICENSE',
    freeEditionBadge: 'FREE',
    proEditionBadge: '⭐ PRO',
    founding100Badge: '🔥 FOUNDING',
    freeAccountInfo: 'Free core multi-streaming via direct keys.',
    lifetimePassText: 'Lifetime Pro Pass (No recurring fees)',
    activeProSubText: 'Active Pro Subscription',
    freeCoreText: 'Free Plan',
    machinesLinked: '{count} of {max} machines linked',
    btnSignInClaim: 'Sign In / Activate License ↗',
    btnPasteToken: 'Paste Token',
    btnManageAccount: 'Manage Account & Devices ↗',
    btnSignOut: 'Sign Out',

    // Elgato-Style Settings Navigation
    settingsNavTitle: 'SETTINGS',
    settingsBackBroadcast: 'Broadcast',
    settingsBackSettings: 'Settings',
    destinationsMenuSub: '{count} configured',
    mobileRemoteMenuTitle: 'Mobile Remote Control',
    mobileRemoteMenuSub: 'Pair phone via Wi-Fi QR code or PIN',
    accountMenuTitle: 'Account & License',
    generalMenuTitle: 'General & Preferences',
    generalMenuSub: 'Language, OBS connection & system',
    destinationsLockedLive: '🔒 Stream destinations are locked while broadcasting live.',
    obsWsStatusConnected: 'CONNECTED',
    obsWsStatusDisconnected: 'DISCONNECTED',
    appDataTitle: 'APP DATA & MAINTENANCE',
    resetDataDesc: 'Clear saved broadcast destinations, cached tokens, and local preferences to start fresh.',
    btnResetApp: '⚠️ Reset App Data & Cache',
    obsWsStatusDisconnected: 'DISCONNECTED',
    btnReconnectWs: '🔄 Reconnect OBS WebSocket',
    systemInfoTitle: 'SYSTEM INFO',

    // Settings Drawer - Preferences / Language
    preferencesTitle: 'PREFERENCES',
    languageLabel: 'Interface Language',

    // Settings Drawer - Destinations
    destinationsTitle: 'STREAM DESTINATIONS',
    btnAddPlatform: '+ Add Platform',
    btnClosePlatforms: '✕ Close Platform Options',
    connectFirstPlatform: '+ Connect your first platform',
    noDestinationsTitle: 'No destinations configured',
    noDestinationsSub: 'Add a platform below to start multi-streaming',
    noDestinationsConfigured: 'No broadcast destinations configured.<br>Click "+ Add Platform" above to link a channel or page.',
    makePrimary: 'Make Primary',
    primaryBadge: '★ Primary',
    anchorPlatformTitle: 'Anchor Platform',
    anchorPlatformTip: 'Powers the core stream engine. Must stay live—turning this off stops the broadcast across all platforms.',
    confirmAnchorToggle: 'Warning: "{name}" is your Primary anchor platform. Turning it off will stop the broadcast across all platforms. Are you sure?',
    syncToken: 'Sync Token',
    syncTokenTip: 'Re-authenticate to enable automated title updates',
    removeDestinationTip: 'Remove destination',

    // Mobile Remote Section
    mobileRemoteTitle: '📱 MOBILE REMOTE CONTROL',
    mobileRemoteSub: 'Preview and control broadcasts from your phone on the local Wi-Fi',
    mobileRemotePrompt: 'Connect your phone to the same Wi-Fi network and scan the QR code.',
    pairingPinLabel: 'Pairing PIN:',
    btnCopyRemoteLink: '📋 Copy Remote Link',
    remoteLinkCopied: '✓ Copied!',

    // Dialogs, Confirms & Toasts
    confirmEndStream: 'Are you sure you want to END the live broadcast on all platforms?',
    confirmPrimarySwitch: 'You are broadcasting live! Switching the primary destination will disrupt the live stream. Are you sure?',
    confirmRemoveDest: 'Remove "{name}" from Simple Streamer?',
    confirmSignOut: 'Sign out of Simple Streamer on this machine?',
    alertSignedOut: 'You are now running in Free Edition.',
    promptPasteToken: 'Paste your Simple Streamer Account / Pro Token:\n\n(Find this in your dashboard at https://simple-streamer.bdjlmn.com/account)',
    accountLinkedAlert: 'Your Simple Streamer account has been connected.',
    accountConnectedWelcome: '✨ Welcome! Signed in as {email}.',
    presetSavedToast: 'Saved changes to preset "{name}".',
    enterPresetPrompt: 'Enter a name for your new broadcast preset:',
    selectPresetToDelete: 'Select a preset to delete:\n\n{list}\n\nEnter preset number (1-{max}):',
    presetDeletedToast: 'Preset "{name}" deleted.',
    cloudSyncDisabledFree: 'ℹ️ Log in to Simple Streamer Pro to sync presets across your 2 machines.',
    cloudSyncSuccess: '☁️ Cloud presets synchronized successfully.',
    missingPresetTitle: 'Please enter a title before saving this preset.',

    // Remote Mobile Studio specific keys
    remoteBrand: 'SIMPLE STREAMER',
    remoteInstall: '📲 Install',
    remoteConnecting: 'CONNECTING',
    remoteConnected: 'ONLINE',
    remoteOffline: 'OFFLINE',
    remoteStandby: 'STANDBY',
    remoteLive: 'LIVE',
    remoteStaged: 'STAGED',
    awaitingObs: 'Awaiting OBS Program...',
    masterAudio: 'MASTER AUDIO',
    silenceAlert: '⚠️ SILENCE (5s+)',
    btnMute: 'MUTE',
    btnMuted: 'MUTED',
    sceneDirector: 'SCENE DIRECTOR',
    directorLivePrefix: 'LIVE:',
    stagePrefix: 'Stage: {name}',
    btnCancel: 'Cancel',
    btnCutLive: 'CUT LIVE ❯',
    broadcastInfo: 'BROADCAST INFO',
    btnEditDetails: 'Edit Details',
    targetPlatforms: 'TARGET PLATFORMS',
    connectingPlatforms: 'Connecting to platforms...',
    metricUptime: 'UPTIME',
    slideToLive: 'SLIDE TO GO LIVE ❯❯',
    slideToStop: 'SLIDE TO STOP ❯❯',
    endLiveTitle: 'End Live Broadcast?',
    endLiveDesc: 'Are you sure you want to stop the live stream on all active destinations?',
    btnKeepStreaming: 'Keep Streaming',
    btnEndLive: 'Yes, End Live',
    muteModalTitle: 'Mute Microphone?',
    muteModalDesc: 'This will immediately silence the microphone output in OBS Studio.',
    btnYesMute: 'Yes, Mute',
    editDetailsTitle: 'Edit Broadcast Details',
    broadcastTitleLabel: 'BROADCAST TITLE',
    broadcastDescLabel: 'DESCRIPTION',
    btnSaveDetails: 'Save Details',
    obsClosedTitle: 'OBS Closed',
    obsClosedDesc: 'OBS is closed on this machine.',
    switchToActive: 'Switch to Active Stream',
    broadcastersTitle: 'Broadcasters:',
    btnUnmute: 'UNMUTE',
    pleaseWait: 'PLEASE WAIT...',
    connectObsTitle: 'Connect to OBS Studio',
    searchingObsPc: 'Searching for OBS PC on Wi-Fi...',
    scanQrCode: 'Scan OBS Dock QR Code',
    orEnterIp: 'Or enter IP / Hostname:',
    btnConnect: 'Connect',
    btnClose: 'Close',
    onAir: '● ON AIR',
    queued: 'QUEUED',
    tapToStage: 'Tap to Stage',
    noScenes: 'No Scenes',

    // Custom RTMP & Mid-Stream Live Update
    customRtmpLabel: 'Custom RTMP',
    addCustomRtmpTitle: 'Add Custom RTMP Destination',
    platformNameLabel: 'Platform Name',
    platformNamePlaceholder: 'e.g. TikTok, X / Twitter, Rumble, Custom',
    serverUrlLabel: 'RTMP Ingest Server URL',
    serverUrlPlaceholder: 'rtmp:// or rtmps://...',
    streamKeyLabel: 'Stream Key',
    streamKeyPlaceholder: 'Paste your stream key',
    customRtmpTip: 'Broadcast to TikTok Live, X / Twitter, LinkedIn, Rumble, or any standard RTMP ingest with 0% extra CPU.',
    btnUpdateLiveInfo: '🔄 Update Live Stream Info',
    updatingLiveInfo: '⏳ Updating Live Info...',
    liveInfoUpdated: '✓ Live broadcast info updated across all platforms!',
    liveInfoUpdateFailed: 'Failed to update live stream info: {error}',
  },

  ar: {
    dir: 'rtl',
    langName: 'العربية',

    // Header & Top Bar
    brandTitle: 'البث المباشر الموحد',
    settingsTitle: 'الإعدادات',
    signIn: 'تسجيل الدخول',
    freeBadge: 'مجاني',
    proBadge: '⭐ برو',
    foundingBadge: '🔥 مؤسس',
    toggleSettingsTip: 'إعدادات المنصات والاتصال',
    backToAppTip: 'العودة للواجهة الرئيسية',
    updateAvailable: 'يتوفر تحديث جديد: <strong>v{version}</strong>',
    btnUpdate: 'تحديث',
    alertTitle: 'تنبيه',
    signedInSuccessTitle: '✓ تم تسجيل الدخول',

    // Active Live Container & Metrics
    broadcastingLive: '● البث المباشر قيد التشغيل',
    metricBitrate: 'معدل البت',
    metricFps: 'إطارات/ث',
    metricDropped: 'مفقودة',
    metricStatus: 'الحالة',
    statusOnline: 'متصل',

    // Main Inputs
    titleLabel: 'عنوان البث',
    titlePlaceholder: 'أدخل عنوان الفيديو هنا...',
    descLabel: 'الوصف',
    descPlaceholder: 'اكتب وصفاً للبث المباشر للمشاهدين...',
    thumbLabel: 'الصورة المصغرة (اختياري)',
    thumbClear: '✕ مسح',
    thumbPrompt: 'انقر أو اسحب صورة مصغرة 16:9',
    thumbSub: 'ضغط تلقائي بدقة 720p (أقل من 200 كيلوبايت)',
    targetsTitle: 'منصات البث المباشر',

    // Presets Dropdown
    presetsHeader: '📋 القوالب الجاهزة...',
    newPreset: '+ قالب جديد...',
    savePresetTo: '💾 حفظ التعديلات على "{name}"',
    deletePreset: '🗑️ حذف قالب...',
    syncPresetsCloud: '☁️ مزامنة القوالب سحابياً',

    // Action Button
    startBroadcast: '▶ بدء البث المباشر',
    endBroadcast: '⏹ إيقاف البث المباشر',
    startingBroadcast: '⏳ جاري تحضير البث...',
    stoppingBroadcast: '⏳ جاري إيقاف البث...',
    connectingObs: '⏳ جاري الاتصال بـ OBS...',
    selectDestFirst: 'حدد وجهة البث أولاً',
    destError: 'خطأ في وجهات البث - تحقق من الإعدادات',

    // Settings Drawer - Account
    accountPassTitle: 'الحساب والترخيص',
    freeEditionBadge: 'مجاني',
    proEditionBadge: '⭐ برو',
    founding100Badge: '🔥 المؤسسون',
    freeAccountInfo: 'بث متعدد أساسي ومجاني عبر المفاتيح المباشرة.',
    lifetimePassText: 'ترخيص المؤسسين الدائم (بدون اشتراك دوري)',
    activeProSubText: 'اشتراك برو نشط',
    freeCoreText: 'الخطة المجانية',
    machinesLinked: '{count} من أصل {max} أجهزة متصلة',
    btnSignInClaim: 'تسجيل الدخول / تفعيل الترخيص ↗',
    btnPasteToken: 'لصق الرمز',
    btnManageAccount: 'إدارة الحساب والأجهزة ↗',
    btnSignOut: 'تسجيل الخروج',

    // Elgato-Style Settings Navigation
    settingsNavTitle: 'الإعدادات',
    settingsBackBroadcast: 'البث',
    settingsBackSettings: 'الإعدادات',
    destinationsMenuSub: '{count} منصة مضبوطة',
    mobileRemoteMenuTitle: 'التحكم عن بُعد عبر الهاتف',
    mobileRemoteMenuSub: 'اقتران الهاتف عبر الباركود أو رمز PIN',
    accountMenuTitle: 'الحساب والترخيص',
    generalMenuTitle: 'عام والتفضيلات',
    generalMenuSub: 'اللغة، اتصال OBS والنظام',
    destinationsLockedLive: '🔒 إعدادات الوجهات مقفلة أثناء البث المباشر.',
    obsWsStatusConnected: 'متصل',
    obsWsStatusDisconnected: 'غير متصل',
    appDataTitle: 'بيانات التطبيق والصيانة',
    resetDataDesc: 'مسح المنصات المحفوظة والرموز المؤقتة والإعدادات للبدء من جديد.',
    btnResetApp: '⚠️ إعادة ضبط بيانات التطبيق والكاش',
    btnReconnectWs: '🔄 إعادة الاتصال بـ OBS',
    systemInfoTitle: 'معلومات النظام',

    // Settings Drawer - Preferences / Language
    preferencesTitle: 'التفضيلات',
    languageLabel: 'لغة الواجهة',

    // Settings Drawer - Destinations
    destinationsTitle: 'وجهات البث',
    btnAddPlatform: '+ إضافة منصة',
    btnClosePlatforms: '✕ إغلاق الخيارات',
    connectFirstPlatform: '+ اربط منصتك الأولى',
    noDestinationsTitle: 'لا توجد منصات مضبوطة',
    noDestinationsSub: 'أضف منصة بث في الأسفل لبدء البث المباشر المتعدد',
    noDestinationsConfigured: 'لا توجد وجهات بث مضبوطة.<br>انقر على "+ إضافة منصة" أعلاه لربط قناة أو صفحة.',
    makePrimary: 'تعيين كرئيسية',
    primaryBadge: '★ رئيسية',
    anchorPlatformTitle: 'المنصة الأساسية',
    anchorPlatformTip: 'المنصة الأساسية لمحرك البث. يجب أن تظل متصلة—إيقافها يوقف البث على جميع المنصات الأخرى.',
    confirmAnchorToggle: 'تنبيه: المنصة "{name}" هي المنصة الأساسية للبث. إيقافها سيؤدي إلى إيقاف البث على جميع المنصات الأخرى. هل أنت متأكد؟',
    syncToken: 'تحديث الرمز',
    syncTokenTip: 'إعادة المصادقة لتفعيل التحديث التلقائي لعنوان البث',
    removeDestinationTip: 'حذف المنصة',

    // Mobile Remote Section
    mobileRemoteTitle: '📱 التحكم عن بعد من الهاتف',
    mobileRemoteSub: 'معاينة وتحكم بالبث المباشر من هاتفك الذكي عبر شبكة Wi-Fi المحلية',
    mobileRemotePrompt: 'صل هاتفك بنفس شبكة Wi-Fi وامسح رمز الاستجابة السريعة (QR).',
    pairingPinLabel: 'رمز الاقتران (PIN):',
    btnCopyRemoteLink: '📋 نسخ رابط التحكم',
    remoteLinkCopied: '✓ تم النسخ!',

    // Dialogs, Confirms & Toasts
    confirmEndStream: 'هل أنت متأكد من رغبتك في إنهاء البث المباشر على جميع المنصات؟',
    confirmPrimarySwitch: 'البث المباشر يعمل حالياً! تغيير المنصة الرئيسية سيؤدي إلى انقطاع البث. هل تريد المتابعة؟',
    confirmRemoveDest: 'هل أنت متأكد من حذف "{name}" من Simple Streamer؟',
    confirmSignOut: 'تسجيل الخروج من Simple Streamer على هذا الجهاز؟',
    alertSignedOut: 'أنت الآن تعمل بالنسخة المجانية.',
    promptPasteToken: 'الصق رمز الترخيص الخاص بك:\n\n(يمكنك نسخه من لوحة التحكم في https://simple-streamer.bdjlmn.com/account)',
    accountLinkedAlert: 'تم ربط حساب Simple Streamer بنجاح.',
    accountConnectedWelcome: '✨ أهلاً بك! تم تسجيل الدخول باسم {email}.',
    presetSavedToast: 'تم حفظ التعديلات على القالب "{name}".',
    enterPresetPrompt: 'أدخل اسماً للقالب الجديد:',
    selectPresetToDelete: 'اختر القالب المراد حذفه:\n\n{list}\n\nأدخل رقم القالب (1-{max}):',
    presetDeletedToast: 'تم حذف القالب "{name}".',
    cloudSyncDisabledFree: 'ℹ️ سجل الدخول إلى Simple Streamer Pro لمزامنة القوالب عبر أجهزتك.',
    cloudSyncSuccess: '☁️ تمت مزامنة القوالب سحابياً بنجاح.',
    missingPresetTitle: 'يرجى إدخال عنوان قبل حفظ القالب.',

    // Remote Mobile Studio specific keys
    remoteBrand: 'البث المباشر الموحد',
    remoteInstall: '📲 تثبيت التطبيق',
    remoteConnecting: 'جاري الاتصال',
    remoteConnected: 'متصل',
    remoteOffline: 'غير متصل',
    remoteStandby: 'استعداد',
    remoteLive: 'مباشر',
    remoteStaged: 'مُجهز',
    awaitingObs: 'في انتظار بث OBS...',
    masterAudio: 'الصوت الرئيسي',
    silenceAlert: '⚠️ صمت (5+ ثوانٍ)',
    btnMute: 'كتم',
    btnMuted: 'مكتوم',
    sceneDirector: 'مخرج المشاهد',
    directorLivePrefix: 'مباشر:',
    stagePrefix: 'تجهيز: {name}',
    btnCancel: 'إلغاء',
    btnCutLive: 'تحويل للبث ❯',
    broadcastInfo: 'معلومات البث',
    btnEditDetails: 'تعديل التفاصيل',
    targetPlatforms: 'منصات البث',
    connectingPlatforms: 'جاري الاتصال بالمنصات...',
    metricUptime: 'مدة البث',
    slideToLive: 'اسحب لبدء البث ❯❯',
    slideToStop: 'اسحب لإيقاف البث ❯❯',
    endLiveTitle: 'إنهاء البث المباشر؟',
    endLiveDesc: 'هل أنت متأكد من رغبتك في إيقاف البث المباشر على جميع المنصات؟',
    btnKeepStreaming: 'متابعة البث',
    btnEndLive: 'نعم، إنهاء البث',
    muteModalTitle: 'كتم الميكروفون؟',
    muteModalDesc: 'سيؤدي هذا إلى كتم صوت الميكروفون فوراً داخل OBS Studio.',
    btnYesMute: 'نعم، كتم',
    editDetailsTitle: 'تعديل تفاصيل البث',
    broadcastTitleLabel: 'عنوان البث المباشر',
    broadcastDescLabel: 'الوصف',
    btnSaveDetails: 'حفظ التفاصيل',
    obsClosedTitle: 'برنامج OBS مغلق',
    obsClosedDesc: 'برنامج OBS مغلق على هذا الجهاز.',
    switchToActive: 'التحويل للبث النشط',
    broadcastersTitle: 'الأجهزة المتاحة:',
    btnUnmute: 'إلغاء الكتم',
    pleaseWait: 'يرجى الانتظار...',
    connectObsTitle: 'الاتصال بـ OBS Studio',
    searchingObsPc: 'جاري البحث عن جهاز OBS على الشبكة...',
    scanQrCode: 'مسح رمز QR من OBS',
    orEnterIp: 'أو أدخل عنوان IP:',
    btnConnect: 'اتصال',
    btnClose: 'إغلاق',
    onAir: '● على الهواء',
    queued: 'جاهز',
    tapToStage: 'اضغط للتجهيز',
    noScenes: 'لا توجد مشاهد',

    // Custom RTMP & Mid-Stream Live Update
    customRtmpLabel: 'RTMP مخصص',
    addCustomRtmpTitle: 'إضافة وجهة RTMP مخصصة',
    platformNameLabel: 'اسم المنصة',
    platformNamePlaceholder: 'مثال: تيك توك، إكس (تويتر)، رومبل، مخصص',
    serverUrlLabel: 'عنوان خادم البث (RTMP Server URL)',
    serverUrlPlaceholder: 'rtmp:// أو rtmps://...',
    streamKeyLabel: 'مفتاح البث (Stream Key)',
    streamKeyPlaceholder: 'الصق مفتاح البث هنا',
    customRtmpTip: 'البث إلى تيك توك، إكس (تويتر)، لينكد إن، رومبل، أو أي خادم RTMP قياسي باستهلاك 0% معالج إضافي.',
    btnUpdateLiveInfo: '🔄 تحديث معلومات البث المباشر',
    updatingLiveInfo: '⏳ جاري تحديث المعلومات...',
    liveInfoUpdated: '✓ تم تحديث معلومات البث المباشر بنجاح عبر جميع المنصات!',
    liveInfoUpdateFailed: 'فشل تحديث معلومات البث: {error}',
  },
};

let currentLanguage = localStorage.getItem('simple_streamer_lang') || 'en';
if (!I18N[currentLanguage]) {
  currentLanguage = 'en';
}

/**
 * Get current active language code ('en' | 'ar')
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * Translate a key with optional dynamic parameter interpolation.
 * Fallbacks to English if key is missing in target language, then returns the raw key.
 *
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const dict = I18N[currentLanguage] || I18N.en;
  let text = dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
  
  if (typeof text === 'string' && params && typeof params === 'object') {
    Object.keys(params).forEach((p) => {
      text = text.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
    });
  }
  return text;
}

/**
 * Switch interface language and re-render all declarative elements in-place without page reload.
 *
 * @param {string} langCode
 */
export function setLanguage(langCode) {
  if (!I18N[langCode]) langCode = 'en';
  currentLanguage = langCode;
  localStorage.setItem('simple_streamer_lang', langCode);

  const dict = I18N[langCode];
  const isRtl = dict.dir === 'rtl';

  document.documentElement.lang = langCode;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

  // 1. Text elements
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // 2. HTML content elements (supports strong/spans)
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (dict[key] !== undefined) {
      el.innerHTML = dict[key];
    }
  });

  // 3. Input placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] !== undefined) {
      el.placeholder = dict[key];
    }
  });

  // 4. Element titles / tooltips
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key] !== undefined) {
      el.title = dict[key];
    }
  });
}
