import { useState, useEffect } from 'react';
import { Translation, AppLanguageConfig } from '../types';

export type { Translation };

export const LOCAL_TEXT_TOKENS_CACHE_KEY = 'sirver_custom_text_tokens_v1';

export const defaultTranslations: Translation[] = [
  // Auth & Account
  { key: 'username', en: 'Username', ar: 'اسم المستخدم', category: 'Auth' },
  { key: 'username_or_email', en: 'Username or Email', ar: 'اسم المستخدم أو البريد الإلكتروني', category: 'Auth' },
  { key: 'password', en: 'Password', ar: 'كلمة المرور', category: 'Auth' },
  { key: 'password_confirm', en: 'Confirm Password', ar: 'تأكيد كلمة المرور', category: 'Auth' },
  { key: 'display_name', en: 'Display Name', ar: 'الاسم المعروض', category: 'Auth' },
  { key: 'email', en: 'Email Address', ar: 'البريد الإلكتروني', category: 'Auth' },
  { key: 'login', en: 'Log In', ar: 'تسجيل الدخول', category: 'Auth' },
  { key: 'signup', en: 'Create Account', ar: 'إنشاء حساب', category: 'Auth' },
  { key: 'already_have_account', en: 'Already have an account? Log In', ar: 'لديك حساب بالفعل؟ تسجيل الدخول', category: 'Auth' },
  { key: 'need_an_account', en: 'Need an account? Sign Up', ar: 'ليس لديك حساب؟ إنشاء حساب جديد', category: 'Auth' },
  { key: 'logout', en: 'Sign Out', ar: 'تسجيل الخروج', category: 'Auth' },
  { key: 'remember_me', en: 'Remember Me', ar: 'تذكرني', category: 'Auth' },
  { key: 'forgot_password', en: 'Forgot Password?', ar: 'نسيت كلمة المرور؟', category: 'Auth' },
  { key: 'reset_password', en: 'Reset Password', ar: 'إعادة تعيين كلمة المرور', category: 'Auth' },
  { key: 'back_to_login', en: 'Back to Login', ar: 'العودة لتسجيل الدخول', category: 'Auth' },
  { key: 'invalid_credentials', en: 'Invalid username/email or password. Please check your credentials.', ar: 'اسم المستخدم/البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق من البيانات.', category: 'Auth' },
  { key: 'auth_failed', en: 'Authentication failed. Please try again.', ar: 'فشلت عملية التحقق. يرجى المحاولة مجدداً.', category: 'Auth' },
  { key: 'network_auth_error', en: 'Unable to connect to the authentication server. Please check your connection.', ar: 'تعذر الاتصال بخادم تسجيل الدخول. يرجى التحقق من اتصال الإنترنت.', category: 'Auth' },

  // Navigation & Workspace
  { key: 'settings', en: 'Settings', ar: 'الإعدادات', category: 'Navigation' },
  { key: 'channels', en: 'Channels', ar: 'القنوات', category: 'Navigation' },
  { key: 'text_channels', en: 'Text Channels', ar: 'القنوات النصية', category: 'Navigation' },
  { key: 'voice_channels', en: 'Voice Channels', ar: 'القنوات الصوتية', category: 'Navigation' },
  { key: 'general_server', en: 'Servers', ar: 'السيرفرات', category: 'Navigation' },
  { key: 'create_server', en: 'Create New Server', ar: 'إنشاء سيرفر جديد', category: 'Navigation' },
  { key: 'create_channel', en: 'Create New Channel', ar: 'إنشاء قناة جديدة', category: 'Navigation' },
  { key: 'direct_messages', en: 'Direct Messages', ar: 'الرسائل المباشرة', category: 'Navigation' },
  { key: 'friends', en: 'Friends', ar: 'الأصدقاء', category: 'Navigation' },
  { key: 'explore_servers', en: 'Explore Workspaces', ar: 'استكشاف مساحات العمل', category: 'Navigation' },
  { key: 'server_members', en: 'Workspace Members', ar: 'أعضاء مساحة العمل', category: 'Navigation' },
  { key: 'search_channels', en: 'Search Channels', ar: 'البحث في القنوات', category: 'Navigation' },

  // Chat & Messages
  { key: 'type_message_placeholder', en: 'Type a message...', ar: 'اكتب رسالة...', category: 'Chat' },
  { key: 'reply', en: 'Reply', ar: 'رد', category: 'Chat' },
  { key: 'send', en: 'Send', ar: 'إرسال', category: 'Chat' },
  { key: 'attachment', en: 'Attachment', ar: 'مرفق', category: 'Chat' },
  { key: 'uploading', en: 'Uploading file...', ar: 'جاري رفع الملف...', category: 'Chat' },
  { key: 'drag_drop_attachments', en: 'Drag & drop files here to attach', ar: 'اسحب وأفلت الملفات هنا لإرفاقها', category: 'Chat' },
  { key: 'delete_message', en: 'Delete Message', ar: 'حذف الرسالة', category: 'Chat' },
  { key: 'edit_message', en: 'Edit Message', ar: 'تعديل الرسالة', category: 'Chat' },
  { key: 'save_edit', en: 'Save Edit', ar: 'حفظ التعديل', category: 'Chat' },
  { key: 'cancel_edit', en: 'Cancel Edit', ar: 'إلغاء التعديل', category: 'Chat' },
  { key: 'upload_success', en: 'Attachment uploaded successfully', ar: 'تم رفع المرفق بنجاح', category: 'Chat' },
  { key: 'send_file', en: 'Send File / Document', ar: 'إرسال ملف / مستند', category: 'Chat' },
  { key: 'pinned_messages', en: 'Pinned Messages', ar: 'الرسائل المثبتة', category: 'Chat' },
  { key: 'pin_message', en: 'Pin Message', ar: 'تثبيت الرسالة', category: 'Chat' },
  { key: 'unpin_message', en: 'Unpin Message', ar: 'إلغاء تثبيت الرسالة', category: 'Chat' },
  { key: 'copy_message_link', en: 'Copy Message Link', ar: 'نسخ رابط الرسالة', category: 'Chat' },
  { key: 'mark_unread', en: 'Mark as Unread', ar: 'تحديد كغير مقروء', category: 'Chat' },
  { key: 'add_reaction', en: 'Add Reaction', ar: 'إضافة تفاعل', category: 'Chat' },
  { key: 'custom_emoji', en: 'Custom Emoji', ar: 'إيموجي مخصص', category: 'Chat' },
  { key: 'voice_note', en: 'Voice Note', ar: 'رسالة صوتية', category: 'Chat' },
  { key: 'hold_to_record', en: 'Hold to record voice note', ar: 'اضغط باستمرار للتسجيل الصوتي', category: 'Chat' },
  { key: 'release_to_send', en: 'Release to send', ar: 'اترك لإرسال الرسالة', category: 'Chat' },
  { key: 'spoiler_text', en: 'Spoiler Content', ar: 'محتوى مخفي (سبويلر)', category: 'Chat' },
  { key: 'media_preview', en: 'Media Preview', ar: 'معاينة الوسائط', category: 'Chat' },
  { key: 'forward_message', en: 'Forward Message', ar: 'إعادة توجيه الرسالة', category: 'Chat' },
  { key: 'copy_text', en: 'Copy Text', ar: 'نسخ النص', category: 'Chat' },
  { key: 'no_messages', en: 'No messages yet. Start the conversation!', ar: 'لا توجد رسائل بعد. ابدأ المحادثة الآن!', category: 'Chat' },

  // Voice & Controls
  { key: 'mute', en: 'Mute', ar: 'كتم', category: 'Voice' },
  { key: 'unmute', en: 'Unmute', ar: 'إلغاء الكتم', category: 'Voice' },
  { key: 'deafen', en: 'Deafen', ar: 'تعطيل الصوت', category: 'Voice' },
  { key: 'undeafen', en: 'Undeafen', ar: 'تمكين الصوت', category: 'Voice' },
  { key: 'voice_connected', en: 'Voice Connected', ar: 'تم الاتصال بالصوت', category: 'Voice' },
  { key: 'leave_call', en: 'Disconnect', ar: 'قطع الاتصال', category: 'Voice' },
  { key: 'screen_share', en: 'Share Screen', ar: 'مشاركة الشاشة', category: 'Voice' },
  { key: 'stop_screen_share', en: 'Stop Sharing', ar: 'إيقاف المشاركة', category: 'Voice' },
  { key: 'toggle_camera', en: 'Camera', ar: 'الكاميرا', category: 'Voice' },
  { key: 'camera_on', en: 'Camera On', ar: 'الكاميرا قيد التشغيل', category: 'Voice' },
  { key: 'camera_off', en: 'Camera Off', ar: 'الكاميرا متوقفة', category: 'Voice' },
  { key: 'noise_suppression', en: 'Noise Suppression', ar: 'إلغاء الضوضاء', category: 'Voice' },
  { key: 'direct_call', en: 'Direct Voice/Video Call', ar: 'مكالمة مباشرة', category: 'Voice' },
  { key: 'calling', en: 'Calling...', ar: 'جاري الاتصال...', category: 'Voice' },
  { key: 'incoming_call', en: 'Incoming Call', ar: 'مكالمة واردة', category: 'Voice' },
  { key: 'answer_call', en: 'Answer Call', ar: 'الرد على المكالمة', category: 'Voice' },
  { key: 'decline_call', en: 'Decline Call', ar: 'رفض المكالمة', category: 'Voice' },
  { key: 'end_call', en: 'End Call', ar: 'إنهاء المكالمة', category: 'Voice' },
  { key: 'connection_quality', en: 'Connection Quality', ar: 'جودة الاتصال', category: 'Voice' },
  { key: 'latency', en: 'Latency', ar: 'زمن الاستجابة', category: 'Voice' },
  { key: 'packet_loss', en: 'Packet Loss', ar: 'فقدان الحزم', category: 'Voice' },
  { key: 'rtc_diagnostics', en: 'Connection Diagnostics', ar: 'تشخيص الاتصال', category: 'Voice' },
  { key: 'pin_tile', en: 'Pin Video Tile', ar: 'تثبيت مربع الفيديو', category: 'Voice' },
  { key: 'spotlight_tile', en: 'Spotlight', ar: 'تسليط الضوء', category: 'Voice' },

  // User Profile & Status
  { key: 'status', en: 'Status', ar: 'الحالة', category: 'Profile' },
  { key: 'bio', en: 'About Me', ar: 'نبذة عني', category: 'Profile' },
  { key: 'joined', en: 'Joined', ar: 'انضم', category: 'Profile' },
  { key: 'role', en: 'Role', ar: 'الرتبة', category: 'Profile' },
  { key: 'active_members', en: 'Active Members', ar: 'الأعضاء النشطون', category: 'Profile' },
  { key: 'online', en: 'Online', ar: 'نشط', category: 'Profile' },
  { key: 'offline', en: 'Offline', ar: 'غير متصل', category: 'Profile' },
  { key: 'away', en: 'Away', ar: 'بالخارج', category: 'Profile' },
  { key: 'dnd', en: 'Do Not Disturb', ar: 'عدم الإزعاج', category: 'Profile' },
  { key: 'invisible', en: 'Invisible', ar: 'اختفاء', category: 'Profile' },
  { key: 'status_message', en: 'Custom Status Message', ar: 'رسالة الحالة المخصصة', category: 'Profile' },
  { key: 'change_avatar', en: 'Change Avatar', ar: 'تغيير الصورة الشخصية', category: 'Profile' },
  { key: 'custom_banner', en: 'Custom Profile Banner', ar: 'بنر الملف الشخصي', category: 'Profile' },
  { key: 'user_profile', en: 'User Profile', ar: 'الملف الشخصي', category: 'Profile' },
  { key: 'copy_user_id', en: 'Copy User ID', ar: 'نسخ معرف المستخدم', category: 'Profile' },
  { key: 'add_friend', en: 'Add Friend', ar: 'إضافة صديق', category: 'Profile' },
  { key: 'remove_friend', en: 'Remove Friend', ar: 'إزالة صديق', category: 'Profile' },
  { key: 'block_user', en: 'Block User', ar: 'حظر المستخدم', category: 'Profile' },
  { key: 'unblock_user', en: 'Unblock User', ar: 'إلغاء حظر المستخدم', category: 'Profile' },
  { key: 'mutual_servers', en: 'Mutual Servers', ar: 'السيرفرات المشتركة', category: 'Profile' },

  // Settings Titles & Categories
  { key: 'user_settings', en: 'User Settings', ar: 'إعدادات المستخدم', category: 'Settings' },
  { key: 'my_account', en: 'My Account', ar: 'حسابي', category: 'Settings' },
  { key: 'profile_customization', en: 'Profile Customization', ar: 'تخصيص الملف الشخصي', category: 'Settings' },
  { key: 'appearance_styling', en: 'Appearance & Styling', ar: 'المظهر والستايل', category: 'Settings' },
  { key: 'voice_video', en: 'Voice & Video Settings', ar: 'إعدادات الصوت وفيديو', category: 'Settings' },
  { key: 'notifications_privacy', en: 'Notifications & Privacy', ar: 'الإشعارات والخصوصية', category: 'Settings' },
  { key: 'storage_data', en: 'Storage & Offline Data', ar: 'التخزين والبيانات المحلية', category: 'Settings' },
  { key: 'admin_theme_manager', en: 'Global App Theme', ar: 'مدير الثيمات والحركات', category: 'Settings' },
  { key: 'admin_text_tokens', en: 'Text Tokens Manager', ar: 'مدير النصوص والترجمات', category: 'Settings' },
  { key: 'language', en: 'Language', ar: 'اللغة', category: 'Settings' },
  { key: 'server_url', en: 'PocketBase Server URL', ar: 'رابط سيرفر PocketBase', category: 'Settings' },
  { key: 'pocketbase_url_desc', en: 'Enter custom PocketBase backend URL for real-time synchronization', ar: 'أدخل رابط سيرفر PocketBase المخصص للمزامنة الفورية', category: 'Settings' },
  { key: 'save', en: 'Save Changes', ar: 'حفظ التغييرات', category: 'Settings' },
  { key: 'cancel', en: 'Cancel', ar: 'إلغاء', category: 'Settings' },
  { key: 'appearance', en: 'Appearance & Styling', ar: 'المظهر والستايل', category: 'Settings' },
  { key: 'theme', en: 'Theme Presets', ar: 'قوالب المظهر', category: 'Settings' },
  { key: 'font_family', en: 'Typography', ar: 'نوع الخط', category: 'Settings' },
  { key: 'font_size', en: 'Font Size Scale', ar: 'حجم الخط', category: 'Settings' },
  { key: 'animations', en: 'Animations & Motion', ar: 'الحركات والتأثيرات', category: 'Settings' },
  { key: 'enable_custom_themes', en: 'Enable Custom Themes', ar: 'تفعيل السمات المخصصة', category: 'Settings' },
  { key: 'available_themes', en: 'Available Published Themes', ar: 'السمات المتاحة للاختيار', category: 'Settings' },
  { key: 'default_theme', en: 'System Default Theme', ar: 'الثيم الافتراضي للسيستم', category: 'Settings' },
  { key: 'clear_cache', en: 'Clear App Cache', ar: 'مسح التخزين المؤقت', category: 'Settings' },
  { key: 'clear_cache_desc', en: 'Delete cached data and reset local state', ar: 'مسح البيانات المخزنة مؤقتاً وإعادة تعيين الحالة', category: 'Settings' },
  { key: 'hardware_acceleration', en: 'Hardware Acceleration', ar: 'التسريع العتادي', category: 'Settings' },
  { key: 'auto_check_updates', en: 'Automatically Check for Updates', ar: 'التحقق التلقائي من التحديثات', category: 'Settings' },
  { key: 'auto_download_updates', en: 'Automatically Download Updates', ar: 'تنزيل التحديثات تلقائياً', category: 'Settings' },
  { key: 'minimize_to_tray', en: 'Minimize to System Tray', ar: 'التصغير إلى شريط المهام', category: 'Settings' },
  { key: 'launch_at_startup', en: 'Launch on OS Startup', ar: 'التشغيل عند بدء تشغيل النظام', category: 'Settings' },
  { key: 'sound_effects', en: 'Sound Effects', ar: 'المؤثرات الصوتية', category: 'Settings' },
  { key: 'account_security', en: 'Account Security', ar: 'أمان الحساب', category: 'Settings' },
  { key: 'export_data', en: 'Export Local Data', ar: 'تصدير البيانات المحلية', category: 'Settings' },
  { key: 'import_data', en: 'Import Local Data', ar: 'استيراد البيانات المحلية', category: 'Settings' },

  // Downloads
  { key: 'downloads_manager', en: 'Downloads Manager', ar: 'مدير التنزيلات', category: 'Downloads' },
  { key: 'directory_path', en: 'Download Directory Path', ar: 'مسار مجلد التنزيلات', category: 'Downloads' },
  { key: 'os_default_downloads', en: 'OS Default Downloads Directory', ar: 'مجلد التنزيلات الافتراضي للنظام', category: 'Downloads' },
  { key: 'custom_download_dir', en: 'Custom Download Directory', ar: 'مجلد تنزيلات مخصص', category: 'Downloads' },
  { key: 'browse_folder', en: 'Browse Folders...', ar: 'استعراض المجلدات...', category: 'Downloads' },
  { key: 'save_download_path', en: 'Save Download Path', ar: 'حفظ مسار التنزيلات', category: 'Downloads' },
  { key: 'reset_download_path', en: 'Reset to Default Path', ar: 'إعادة ضبط للمسار الافتراضي', category: 'Downloads' },
  { key: 'active_downloads', en: 'Active Downloads', ar: 'التنزيلات النشطة', category: 'Downloads' },
  { key: 'completed_downloads', en: 'Completed Downloads', ar: 'التنزيلات المكتملة', category: 'Downloads' },
  { key: 'pause_download', en: 'Pause', ar: 'إيقاف مؤقت', category: 'Downloads' },
  { key: 'resume_download', en: 'Resume', ar: 'استئناف', category: 'Downloads' },
  { key: 'cancel_download', en: 'Cancel Download', ar: 'إلغاء التنزيل', category: 'Downloads' },
  { key: 'retry_download', en: 'Retry', ar: 'إعادة المحاولة', category: 'Downloads' },
  { key: 'open_file', en: 'Open File', ar: 'فتح الملف', category: 'Downloads' },
  { key: 'open_folder', en: 'Open Folder', ar: 'فتح المجلد', category: 'Downloads' },
  { key: 'copy_file_path', en: 'Copy File Path', ar: 'نسخ مسار الملف', category: 'Downloads' },
  { key: 'clear_download_history', en: 'Clear Download History', ar: 'مسح سجل التنزيلات', category: 'Downloads' },
  { key: 'delete_downloaded_file', en: 'Delete File', ar: 'حذف الملف', category: 'Downloads' },
  { key: 'download_speed', en: 'Download Speed', ar: 'سرعة التنزيل', category: 'Downloads' },
  { key: 'remaining_time', en: 'Remaining Time', ar: 'الوقت المتبقي', category: 'Downloads' },

  // Updates
  { key: 'application_updates', en: 'Application Updates', ar: 'تحديثات التطبيق', category: 'Updates' },
  { key: 'current_version', en: 'Current Version', ar: 'الإصدار الحالي', category: 'Updates' },
  { key: 'checking_updates', en: 'Checking for updates...', ar: 'جاري التحقق من التحديثات...', category: 'Updates' },
  { key: 'update_available', en: 'New Update Available!', ar: 'يتوفر تحديث جديد!', category: 'Updates' },
  { key: 'up_to_date', en: 'You are on the latest version', ar: 'أنت على أحدث إصدار', category: 'Updates' },
  { key: 'download_update', en: 'Download Update', ar: 'تنزيل التحديث', category: 'Updates' },
  { key: 'install_update', en: 'Install & Restart', ar: 'تثبيت وإعادة التشغيل', category: 'Updates' },
  { key: 'release_notes', en: 'Release Notes', ar: 'ملاحظات الإصدار', category: 'Updates' },
  { key: 'manual_windows_update', en: 'Manual Windows Update (.msi)', ar: 'التحديث اليدوي المباشر (ويندوز MSI)', category: 'Updates' },
  { key: 'download_silent_install', en: 'Download & Silent Install', ar: 'تنزيل وتثبيت صامت', category: 'Updates' },
  { key: 'run_silent_install', en: 'Run Silent Install Now', ar: 'التثبيت الصامت الآن', category: 'Updates' },
  { key: 'installing_silently', en: 'Installing Silently...', ar: 'جاري التثبيت الصامت...', category: 'Updates' },
  { key: 'release_channel', en: 'Release Channel', ar: 'قناة الإصدارات', category: 'Updates' },
  { key: 'stable_channel', en: 'Stable', ar: 'مستقر', category: 'Updates' },
  { key: 'beta_channel', en: 'Beta', ar: 'تجريبي', category: 'Updates' },

  // Music
  { key: 'music_player_title', en: 'Music Bot & Radio Player', ar: 'مشغل الموسيقى والراديو', category: 'Music' },
  { key: 'search_music_placeholder', en: 'Search track, YouTube or audio URL...', ar: 'ابحث عن أغنية، يوتيوب أو رابط صوتي...', category: 'Music' },
  { key: 'play_music', en: 'Play', ar: 'تشغيل', category: 'Music' },
  { key: 'pause_music', en: 'Pause', ar: 'إيقاف مؤقت', category: 'Music' },
  { key: 'next_track', en: 'Next Track', ar: 'التراك التالي', category: 'Music' },
  { key: 'previous_track', en: 'Previous Track', ar: 'التراك السابق', category: 'Music' },
  { key: 'shuffle_queue', en: 'Shuffle Queue', ar: 'خلط القائمة', category: 'Music' },
  { key: 'repeat_mode', en: 'Repeat Mode', ar: 'وضع التكرار', category: 'Music' },
  { key: 'now_playing', en: 'Now Playing', ar: 'يعمل الآن', category: 'Music' },
  { key: 'music_queue', en: 'Music Queue', ar: 'قائمة الانتظار', category: 'Music' },
  { key: 'clear_music_queue', en: 'Clear Queue', ar: 'تفريغ القائمة', category: 'Music' },
  { key: 'add_to_queue', en: 'Add to Queue', ar: 'إضافة للقائمة', category: 'Music' },
  { key: 'ambient_sounds', en: 'Ambient Sounds', ar: 'الأصوات المحيطة', category: 'Music' },
  { key: 'radio_streams', en: 'Live Radio Streams', ar: 'محطات الراديو المباشرة', category: 'Music' },
  { key: 'soundboard', en: 'Voice Soundboard', ar: 'لوحة المؤثرات الصوتية', category: 'Music' },

  // Server
  { key: 'server_settings', en: 'Workspace Settings', ar: 'إعدادات مساحة العمل', category: 'Server' },
  { key: 'server_overview', en: 'Workspace Overview', ar: 'نظرة عامة على السيرفر', category: 'Server' },
  { key: 'server_name', en: 'Workspace Name', ar: 'اسم مساحة العمل', category: 'Server' },
  { key: 'server_icon', en: 'Workspace Icon', ar: 'أيقونة السيرفر', category: 'Server' },
  { key: 'roles_permissions', en: 'Roles & Permissions', ar: 'الرتب والصلاحيات', category: 'Server' },
  { key: 'create_role', en: 'Create Role', ar: 'إنشاء رتبة', category: 'Server' },
  { key: 'edit_role', en: 'Edit Role', ar: 'تعديل الرتبة', category: 'Server' },
  { key: 'delete_role', en: 'Delete Role', ar: 'حذف الرتبة', category: 'Server' },
  { key: 'member_management', en: 'Member Management', ar: 'إدارة الأعضاء', category: 'Server' },
  { key: 'ban_member', en: 'Ban Member', ar: 'حظر العضو', category: 'Server' },
  { key: 'kick_member', en: 'Kick Member', ar: 'طرد العضو', category: 'Server' },
  { key: 'invite_link', en: 'Invite Link', ar: 'رابط الدعوة', category: 'Server' },
  { key: 'copy_invite', en: 'Copy Invite', ar: 'نسخ رابط الدعوة', category: 'Server' },
  { key: 'audit_logs', en: 'Audit Logs', ar: 'سجل الأنشطة', category: 'Server' },
  { key: 'boost_status', en: 'Server Boost Level', ar: 'مستوى دعم السيرفر', category: 'Server' },
  { key: 'delete_server', en: 'Delete Workspace', ar: 'حذف مساحة العمل', category: 'Server' },

  // Theme Editor & Tokens
  { key: 'theme_editor_title', en: 'Theme & Token Workspace', ar: 'ورشة عمل الثيمات والمتغيرات', category: 'ThemeEditor' },
  { key: 'create_new_theme', en: 'Create New Theme', ar: 'إنشاء ثيم جديد', category: 'ThemeEditor' },
  { key: 'duplicate_theme', en: 'Duplicate Theme', ar: 'نسخ الثيم', category: 'ThemeEditor' },
  { key: 'import_theme', en: 'Import Theme JSON', ar: 'استيراد ثيم JSON', category: 'ThemeEditor' },
  { key: 'export_theme', en: 'Export Theme JSON', ar: 'تصدير ثيم JSON', category: 'ThemeEditor' },
  { key: 'publish_theme', en: 'Publish Theme', ar: 'نشر الثيم', category: 'ThemeEditor' },
  { key: 'unpublish_theme', en: 'Unpublish Theme', ar: 'إلغاء نشر الثيم', category: 'ThemeEditor' },
  { key: 'delete_theme', en: 'Delete Theme', ar: 'حذف الثيم', category: 'ThemeEditor' },
  { key: 'save_draft', en: 'Save as Draft', ar: 'حفظ كمسودة', category: 'ThemeEditor' },
  { key: 'unsaved_changes', en: 'You have unsaved changes!', ar: 'لديك تغييرات غير محفوظة!', category: 'ThemeEditor' },
  { key: 'live_preview', en: 'Live Application Preview', ar: 'المعاينة الفورية للتطبيق', category: 'ThemeEditor' },
  { key: 'tokens_tab', en: 'Visual Tokens', ar: 'المتغيرات البصرية', category: 'ThemeEditor' },
  { key: 'layout_tab', en: 'Layout & Sizes', ar: 'الهيكل والأبعاد', category: 'ThemeEditor' },
  { key: 'animations_tab', en: 'Motion & Effects', ar: 'الحركات والتأثيرات', category: 'ThemeEditor' },
  { key: 'replay_animation', en: 'Replay Animation', ar: 'إعادة تشغيل الحركة', category: 'ThemeEditor' },

  // Modals & Confirmation
  { key: 'delete_channel', en: 'Delete Channel', ar: 'حذف القناة', category: 'Modals' },
  { key: 'delete_confirm', en: 'Are you sure you want to delete this permanently?', ar: 'هل أنت متأكد من رغبتك بالحذف نهائياً؟', category: 'Modals' },
  { key: 'confirm_action', en: 'Confirm Action', ar: 'تأكيد الإجراء', category: 'Modals' },
  { key: 'close_dialog', en: 'Close', ar: 'إغلاق', category: 'Modals' },
  { key: 'apply_changes', en: 'Apply Changes', ar: 'تطبيق التغييرات', category: 'Modals' },

  // Status & Feedback
  { key: 'loading', en: 'Loading, please wait...', ar: 'جاري التحميل، يرجى الانتظار...', category: 'General' },
  { key: 'connecting', en: 'Connecting to server...', ar: 'جاري الاتصال بالسيرفر...', category: 'General' },
  { key: 'connected', en: 'Connected', ar: 'متصل', category: 'General' },
  { key: 'offline_mode', en: 'Offline Mode', ar: 'وضع عدم الاتصال', category: 'General' },
  { key: 'search_placeholder', en: 'Search...', ar: 'بحث...', category: 'General' },
  { key: 'success', en: 'Operation completed successfully', ar: 'تم تنفيذ العملية بنجاح', category: 'General' },
  { key: 'error', en: 'An error occurred. Please try again', ar: 'حدث خطأ. يرجى المحاولة مرة أخرى', category: 'General' },
  { key: 'retry', en: 'Retry', ar: 'إعادة المحاولة', category: 'General' },
  { key: 'options', en: 'Options', ar: 'الخيارات', category: 'General' },
  { key: 'details', en: 'Details', ar: 'التفاصيل', category: 'General' },
  { key: 'copied', en: 'Copied!', ar: 'تم النسخ!', category: 'General' },
  { key: 'yes', en: 'Yes', ar: 'نعم', category: 'General' },
  { key: 'no', en: 'No', ar: 'لا', category: 'General' },
  { key: 'ok', en: 'OK', ar: 'حسناً', category: 'General' },
  { key: 'back', en: 'Back', ar: 'رجوع', category: 'General' },
  { key: 'next', en: 'Next', ar: 'التالي', category: 'General' },
  { key: 'finish', en: 'Finish', ar: 'إنهاء', category: 'General' }
];

export function getCachedCustomTextTokens(): Translation[] {
  try {
    const raw = localStorage.getItem(LOCAL_TEXT_TOKENS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically merge missing default keys into cached tokens
        const existingKeys = new Set(parsed.map((item: any) => item.key));
        const merged = [...parsed];
        defaultTranslations.forEach((def) => {
          if (!existingKeys.has(def.key)) {
            merged.push(def);
          }
        });
        return merged;
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached text tokens:', e);
  }
  return defaultTranslations;
}

export function saveCachedCustomTextTokens(tokens: Translation[]) {
  try {
    localStorage.setItem(LOCAL_TEXT_TOKENS_CACHE_KEY, JSON.stringify(tokens));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('text-tokens-changed', { detail: tokens }));
    }
  } catch (e) {
    console.warn('Failed to save cached text tokens:', e);
  }
}

export function getLanguageDictionary(translations: Translation[], lang: 'en' | 'ar'): AppLanguageConfig {
  const dictionary: AppLanguageConfig = {};

  // 1. Populate defaults
  defaultTranslations.forEach((item) => {
    dictionary[item.key] = lang === 'ar' ? item.ar : item.en;
  });

  // 2. Populate cached local custom tokens
  const cachedCustom = getCachedCustomTextTokens();
  cachedCustom.forEach((item) => {
    const val = item.translations?.[lang] || (lang === 'ar' ? item.ar : item.en);
    if (val) {
      dictionary[item.key] = val;
    }
  });

  // 3. Override with remote DB translations if provided
  if (Array.isArray(translations)) {
    translations.forEach((item) => {
      const val = item.translations?.[lang] || (lang === 'ar' ? item.ar : item.en);
      if (val) {
        dictionary[item.key] = val;
      }
    });
  }

  return dictionary;
}

export function useTranslation(lang: 'en' | 'ar') {
  const [dictionary, setDictionary] = useState<AppLanguageConfig>(() =>
    getLanguageDictionary(getCachedCustomTextTokens(), lang)
  );

  useEffect(() => {
    const updateDict = () => {
      setDictionary(getLanguageDictionary(getCachedCustomTextTokens(), lang));
    };

    window.addEventListener('text-tokens-changed', updateDict);
    return () => window.removeEventListener('text-tokens-changed', updateDict);
  }, [lang]);

  const t = (key: string, fallback?: string): string => {
    if (dictionary[key]) return dictionary[key];
    const def = defaultTranslations.find((d) => d.key === key);
    if (def) return lang === 'ar' ? def.ar : def.en;
    return fallback || key;
  };

  return { t, dictionary };
}

