"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "es" | "hi" | "bn";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    title: "BB84 Quantum Key Distribution Portal",
    subtitle: "Visualize quantum key exchange, secure documents in the file locker, and encrypt communications with XOR cryptography.",
    apiOffline: "API Connection Offline: Could not connect to FastAPI backend on http://127.0.0.1:8000. Please ensure the backend server is running.",
    retryBtn: "Retry Connection",
    navDashboard: "Dashboard",
    navSimulator: "Simulator",
    navLocker: "File Locker",
    navAdmin: "Admin Logs",
    navProfile: "Profile Settings",
    loginBtn: "Login",
    logoutBtn: "Logout",
    registerBtn: "Register",
    welcome: "Welcome",
    guestBadge: "Guest Mode",
    userBadge: "Operator Mode",
    adminBadge: "Administrator Mode",
    
    // Dashboard Tab
    dashTitle: "System Analytics Dashboard",
    totalUsers: "Registered Users",
    totalFiles: "Stored Encrypted Files",
    totalSims: "Simulations Run",
    avgQber: "Average QBER",
    eveDetections: "Eavesdropper Intercepts",
    statsOverview: "Global Network Status",
    activitiesTitle: "Your Recent Security Activity",
    noActivity: "No actions recorded yet. Run a simulation or upload a file to start!",
    
    // Simulator Tab
    simTitle: "Quantum Channel Simulator",
    qubitsSent: "Qubits Sent",
    noiseLevel: "Channel Noise",
    eveToggle: "Active Eavesdropper (Eve)",
    eveEnabled: "Enabled",
    eveDisabled: "Disabled",
    simBtn: "Generate New Quantum Key",
    simStatus: "Qubit index",
    eveAlert: "High Error Rate Detected!",
    eveDesc: "The QBER of {percent}% exceeds the secure threshold (15%). This represents active eavesdropping on the channel. The key was discarded to prevent interception.",
    secureAlert: "Secure Quantum Key Established!",
    secureDesc: "QBER is {percent}%. Alice and Bob have successfully reconciled their matching qubits. The key is fully safe.",
    recKey: "Reconciled Quantum Key (Binary)",
    copyKey: "Copy Key",
    copied: "Copied!",
    
    // Locker Tab
    lockerTitle: "Secure File Locker",
    uploadBtn: "Upload & Encrypt File",
    chooseFile: "Choose File",
    enterKey: "Enter Quantum Key (Binary string)",
    filesList: "Your Encrypted Files",
    noFiles: "No files encrypted yet. Generate a key, select a file, and lock it!",
    filenameCol: "Filename",
    ownerCol: "Owner",
    dateCol: "Created Date",
    actionCol: "Actions",
    downloadBtn: "Download & Decrypt",
    deleteBtn: "Delete",
    decryptModalTitle: "Decrypt Saved File",
    decryptPrompt: "This file is encrypted with XOR cryptography. Enter the correct quantum key to unlock and download:",
    decryptSubmit: "Decrypt & Download",
    
    // Admin Tab
    adminTitle: "System Audit Logs",
    dbBackupTitle: "Database Backup & Recovery",
    backupDesc: "Download a full SQLite database backup (`quantum.db`) or restore database history from a backup file.",
    downloadBackupBtn: "Download Database Backup",
    restoreBackupBtn: "Restore Database",
    restorePrompt: "Upload a valid SQLite `.db` backup file to restore. WARNING: This will overwrite all current users, files, and logs.",
    logId: "Log ID",
    logUser: "User",
    logAction: "Action",
    logDetails: "Details",
    logTime: "Timestamp",
    
    // Profile Tab
    profileTitle: "User Profile Settings",
    fullNameLabel: "Full Name",
    usernameLabel: "Username / Access ID",
    roleLabel: "Security Clearence Level",
    passwordLabel: "New Password (leave blank to keep current)",
    saveBtn: "Save Profile Changes",
    createdAtLabel: "Account Created At",
    subscriptionLabel: "Subscription Plan Tier",
    upgradeBtn: "Upgrade Subscription",
    tierFree: "Free / Basic Tier",
    tierPro: "Pro Operational Tier",
    tierEnterprise: "Enterprise Sentinel Tier",
    
    // Messenger panel
    messengerTitle: "Quantum Secure Messenger",
    tabEncrypt: "Encrypt Message",
    tabDecrypt: "Decrypt Ciphertext",
    secretMsg: "Secret Message",
    cipherOut: "Ciphertext (Base64)",
    copyCipher: "Copy Cipher",
    submitEncrypt: "Encrypt Message",
    submitDecrypt: "Decrypt Ciphertext",
    decryptedTitle: "Decryption Output Stream",
    decryptPlaceholder: "Enter Base64 ciphertext..."
  },
  es: {
    title: "Portal de Distribución de Claves Cuánticas BB84",
    subtitle: "Visualice el intercambio de claves cuánticas, proteja documentos en el casillero de archivos y encripte comunicaciones con criptografía XOR.",
    apiOffline: "Conexión de API Fuera de Línea: No se pudo conectar con el servidor FastAPI en http://127.0.0.1:8000. Asegúrese de que el servidor esté activo.",
    retryBtn: "Reintentar Conexión",
    navDashboard: "Panel",
    navSimulator: "Simulador",
    navLocker: "Casillero",
    navAdmin: "Auditoría",
    navProfile: "Ajustes de Perfil",
    loginBtn: "Iniciar Sesión",
    logoutBtn: "Cerrar Sesión",
    registerBtn: "Registrarse",
    welcome: "Bienvenido",
    guestBadge: "Modo Invitado",
    userBadge: "Modo Operador",
    adminBadge: "Modo Administrador",
    
    // Dashboard Tab
    dashTitle: "Panel de Análisis del Sistema",
    totalUsers: "Usuarios Registrados",
    totalFiles: "Archivos Encriptados",
    totalSims: "Simulaciones Ejecutadas",
    avgQber: "Promedio QBER",
    eveDetections: "Intercepciones de Eve",
    statsOverview: "Estado Global de la Red",
    activitiesTitle: "Su Actividad Reciente de Seguridad",
    noActivity: "Aún no hay acciones registradas. ¡Ejecute una simulación o suba un archivo para comenzar!",
    
    // Simulator Tab
    simTitle: "Simulador de Canal Cuántico",
    qubitsSent: "Qubits Enviados",
    noiseLevel: "Ruido del Canal",
    eveToggle: "Interceptor Activo (Eve)",
    eveEnabled: "Habilitado",
    eveDisabled: "Inhabilitado",
    simBtn: "Generar Nueva Clave Cuántica",
    simStatus: "Índice de Qubits",
    eveAlert: "¡Tasa de Error Elevada Detectada!",
    eveDesc: "El QBER de {percent}% supera el umbral seguro (15%). Esto indica intercepción activa en el canal. La clave fue descartada para prevenir espionaje.",
    secureAlert: "¡Clave Cuántica Segura Establecida!",
    secureDesc: "El QBER es {percent}%. Alice y Bob han conciliado con éxito sus qubits coincidentes. La clave es completamente segura.",
    recKey: "Clave Cuántica Conciliada (Binaria)",
    copyKey: "Copiar Clave",
    copied: "¡Copiado!",
    
    // Locker Tab
    lockerTitle: "Casillero de Archivos Seguro",
    uploadBtn: "Subir y Encriptar Archivo",
    chooseFile: "Elegir Archivo",
    enterKey: "Ingrese Clave Cuántica (Cadena binaria)",
    filesList: "Sus Archivos Encriptados",
    noFiles: "Ningún archivo encriptado aún. ¡Genere una clave, seleccione un archivo y bloquéelo!",
    filenameCol: "Nombre de Archivo",
    ownerCol: "Propietario",
    dateCol: "Fecha de Creación",
    actionCol: "Acciones",
    downloadBtn: "Descargar y Desencriptar",
    deleteBtn: "Eliminar",
    decryptModalTitle: "Desencriptar Archivo Guardado",
    decryptPrompt: "Este archivo está encriptado con criptografía XOR. Ingrese la clave cuántica correcta para desbloquear y descargar:",
    decryptSubmit: "Desencriptar y Descargar",
    
    // Admin Tab
    adminTitle: "Registros de Auditoría del Sistema",
    dbBackupTitle: "Respaldo y Recuperación de Base de Datos",
    backupDesc: "Descargue un respaldo completo de la base de datos SQLite (`quantum.db`) o restaure el historial desde un archivo de respaldo.",
    downloadBackupBtn: "Descargar Respaldo de DB",
    restoreBackupBtn: "Restaurar Base de Datos",
    restorePrompt: "Suba un archivo SQLite `.db` válido para restaurar. ADVERTENCIA: Esto sobrescribirá todos los usuarios, archivos y registros actuales.",
    logId: "ID Reg.",
    logUser: "Usuario",
    logAction: "Acción",
    logDetails: "Detalles",
    logTime: "Fecha/Hora",
    
    // Profile Tab
    profileTitle: "Ajustes del Perfil de Usuario",
    fullNameLabel: "Nombre Completo",
    usernameLabel: "ID de Acceso / Nombre de Usuario",
    roleLabel: "Nivel de Autorización de Seguridad",
    passwordLabel: "Nueva Contraseña (dejar en blanco para mantener la actual)",
    saveBtn: "Guardar Cambios de Perfil",
    createdAtLabel: "Cuenta Creada el",
    subscriptionLabel: "Nivel de Plan de Suscripción",
    upgradeBtn: "Actualizar Suscripción",
    tierFree: "Nivel Gratis / Básico",
    tierPro: "Nivel Operativo Pro",
    tierEnterprise: "Nivel Enterprise Sentinel",
    
    // Messenger panel
    messengerTitle: "Mensajería Cuántica Segura",
    tabEncrypt: "Encriptar Mensaje",
    tabDecrypt: "Desencriptar Cifrado",
    secretMsg: "Mensaje Secreto",
    cipherOut: "Texto Cifrado (Base64)",
    copyCipher: "Copiar Cifrado",
    submitEncrypt: "Encriptar Mensaje",
    submitDecrypt: "Desencriptar Cifrado",
    decryptedTitle: "Flujo de Desencriptación de Salida",
    decryptPlaceholder: "Ingrese texto cifrado Base64..."
  },
  hi: {
    title: "BB84 क्वांटम कुंजी वितरण पोर्टल",
    subtitle: "क्वांटम कुंजी विनिमय की कल्पना करें, फ़ाइल लॉकर में दस्तावेज़ों को सुरक्षित करें, और XOR क्रिप्टोग्राफी के साथ संचार को एन्क्रिप्ट करें।",
    apiOffline: "API कनेक्शन ऑफ़लाइन: http://127.0.0.1:8000 पर FastAPI बैकएंड से कनेक्ट नहीं हो सका।",
    retryBtn: "कनेक्शन पुनः प्रयास करें",
    navDashboard: "डैशबोर्ड",
    navSimulator: "सिम्युलेटर",
    navLocker: "फ़ाइल लॉकर",
    navAdmin: "ऑडिट लॉग्स",
    navProfile: "प्रोफ़ाइल सेटिंग्स",
    loginBtn: "लॉगिन",
    logoutBtn: "लॉगआउट",
    registerBtn: "पंजीकरण",
    welcome: "स्वागत हे",
    guestBadge: "अतिथि मोड",
    userBadge: "ऑपरेटर मोड",
    adminBadge: "प्रशासक मोड",
    
    // Dashboard Tab
    dashTitle: "सिस्टम विश्लेषिकी डैशबोर्ड",
    totalUsers: "पंजीकृत उपयोगकर्ता",
    totalFiles: "संग्रहीत एन्क्रिप्टेड फ़ाइलें",
    totalSims: "चलाए गए सिमुलेशन",
    avgQber: "औसत QBER",
    eveDetections: "ईव्सड्रॉपर इंटरसेप्ट्स",
    statsOverview: "वैश्विक नेटवर्क स्थिति",
    activitiesTitle: "आपकी हालिया सुरक्षा गतिविधि",
    noActivity: "अभी तक कोई कार्रवाई दर्ज नहीं की गई है!",
    
    // Simulator Tab
    simTitle: "क्वांटम चैनल सिम्युलेटर",
    qubitsSent: "भेजे गए क्विबिट्स",
    noiseLevel: "चैनल का शोर",
    eveToggle: "सक्रिय ईव्सड्रॉपर (ईव)",
    eveEnabled: "सक्षम",
    eveDisabled: "अक्षम",
    simBtn: "नई क्वांटम कुंजी उत्पन्न करें",
    simStatus: "क्विबिट इंडेक्स",
    eveAlert: "उच्च त्रुटि दर का पता चला!",
    eveDesc: "QBER दर {percent}% सुरक्षित सीमा (15%) से अधिक है।",
    secureAlert: "सुरक्षित क्वांटम कुंजी स्थापित!",
    secureDesc: "QBER दर {percent}% है। Alice और Bob ने अपने मिलान वाले क्विबिट्स को सफलतापूर्वक संरेखित किया है।",
    recKey: "संरेखित क्वांटम कुंजी (बाइनरी)",
    copyKey: "कुंजी कॉपी करें",
    copied: "कॉपी किया गया!",
    
    // Locker Tab
    lockerTitle: "सुरक्षित फ़ाइल लॉकर",
    uploadBtn: "फ़ाइल अपलोड और एन्क्रिप्ट करें",
    chooseFile: "फ़ाइल चुनें",
    enterKey: "क्वांटम कुंजी दर्ज करें (बाइनरी)",
    filesList: "आपकी एन्क्रिप्टेड फ़ाइलें",
    noFiles: "अभी तक कोई फ़ाइल एन्क्रिप्ट नहीं की गई है।",
    filenameCol: "फ़ाइल का नाम",
    ownerCol: "स्वामी",
    dateCol: "निर्माण तिथि",
    actionCol: "कार्रवाई",
    downloadBtn: "डाउनलोड और डिक्रिप्ट",
    deleteBtn: "हटाएं",
    decryptModalTitle: "सहेजी गई फ़ाइल डिक्रिप्ट करें",
    decryptPrompt: "XOR क्रिप्टोग्राफी का उपयोग करके फ़ाइल डिक्रिप्ट करें।",
    decryptSubmit: "डिक्रिप्ट और डाउनलोड",
    
    // Admin Tab
    adminTitle: "सिस्टम ऑडिट लॉग्स",
    dbBackupTitle: "डेटाबेस बैकअप और रिकवरी",
    backupDesc: "SQLite डेटाबेस बैकअप डाउनलोड करें या बैकअप फ़ाइल से पुनर्स्थापित करें।",
    downloadBackupBtn: "डेटाबेस बैकअप डाउनलोड करें",
    restoreBackupBtn: "पुनर्स्थापित करें",
    restorePrompt: "पुनर्स्थापित करने के लिए मान्य .db फ़ाइल अपलोड करें।",
    logId: "लॉग आईडी",
    logUser: "उपयोगकर्ता",
    logAction: "कार्रवाई",
    logDetails: "विवरण",
    logTime: "टाइमस्टैम्प",
    
    // Profile Tab
    profileTitle: "उपयोगकर्ता प्रोफ़ाइल सेटिंग्स",
    fullNameLabel: "पूरा नाम",
    usernameLabel: "यूज़रनेम / एक्सेस आईडी",
    roleLabel: "सुरक्षा निकासी स्तर",
    passwordLabel: "नया पासवर्ड",
    saveBtn: "प्रोफ़ाइल परिवर्तन सहेजें",
    createdAtLabel: "खाता निर्माण समय",
    subscriptionLabel: "सदस्यता योजना स्तर",
    upgradeBtn: "सदस्यता अपग्रेड करें",
    tierFree: "मुफ़्त / बुनियादी स्तर",
    tierPro: "प्रो परिचालन स्तर",
    tierEnterprise: "एंटरप्राइज़ सेंटिनल स्तर",
    
    // Messenger
    messengerTitle: "क्वांटम सुरक्षित मैसेंजर",
    tabEncrypt: "संदेश एन्क्रिप्ट करें",
    tabDecrypt: "सिफरटेक्स्ट डिक्रिप्ट करें",
    secretMsg: "गुप्त संदेश",
    cipherOut: "सिफरटेक्स्ट (Base64)",
    copyCipher: "सिफर कॉपी करें",
    submitEncrypt: "संदेश एन्क्रिप्ट करें",
    submitDecrypt: "सिफर डिक्रिप्ट करें",
    decryptedTitle: "डिक्रिप्शन आउटपुट स्ट्रीम",
    decryptPlaceholder: "Base64 सिफरटेक्स्ट दर्ज करें..."
  },
  bn: {
    title: "BB84 কোয়ান্টাম কী ডিস্ট্রিবিউশন পোর্টাল",
    subtitle: "কোয়ান্টাম কী এক্সচেঞ্জ ভিজ্যুয়ালাইজ করুন, ফাইল লকারে নথি সুরক্ষিত করুন এবং XOR ক্রিপ্টোগ্রাফি দিয়ে যোগাযোগ এনক্রিপ্ট করুন।",
    apiOffline: "API সংযোগ অফলাইন: http://127.0.0.1:8000 এ FastAPI ব্যাকএন্ডের সাথে সংযোগ করা যায়নি।",
    retryBtn: "পুনরায় সংযোগ চেষ্টা করুন",
    navDashboard: "ড্যাশবোর্ড",
    navSimulator: "সিমুলেটর",
    navLocker: "ফাইল লকার",
    navAdmin: "অডিট লগ",
    navProfile: "প্রোফাইল সেটিংস",
    loginBtn: "লগইন",
    logoutBtn: "লগআউট",
    registerBtn: "নিবন্ধন",
    welcome: "স্বাগতম",
    guestBadge: "গেস্ট মোড",
    userBadge: "অপারেটর মোড",
    adminBadge: "প্রশাসক মোড",
    
    // Dashboard Tab
    dashTitle: "সিস্টেম অ্যানালিটিক্স ড্যাশবোর্ড",
    totalUsers: "নিবন্ধিত ব্যবহারকারী",
    totalFiles: "এনক্রিপ্ট করা ফাইল",
    totalSims: "সিমুলেশন রান",
    avgQber: "গড় QBER",
    eveDetections: "ইভসড্রপার ইন্টারসেপ্ট",
    statsOverview: "গ্লোবাল নেটওয়ার্ক স্ট্যাটাস",
    activitiesTitle: "আপনার সাম্প্রতিক নিরাপত্তা কার্যকলাপ",
    noActivity: "এখনও কোন কার্যকলাপ রেকর্ড করা হয়নি!",
    
    // Simulator Tab
    simTitle: "কোয়ান্টাম চ্যানেল সিমুলেটর",
    qubitsSent: "প্রেরিত কিউবিট",
    noiseLevel: "চ্যানেল নয়েজ",
    eveToggle: "সক্রিয় ইভসড্রপার (ইভ)",
    eveEnabled: "সক্ষম",
    eveDisabled: "অক্ষম",
    simBtn: "নতুন কোয়ান্টাম কী তৈরি করুন",
    simStatus: "কিউবিট সূচক",
    eveAlert: "উচ্চ ত্রুটি হার সনাক্ত হয়েছে!",
    eveDesc: "QBER হার {percent}% নিরাপদ সীমা (15%) অতিক্রম করেছে।",
    secureAlert: "নিরাপদ কোয়ান্টাম কী প্রতিষ্ঠিত!",
    secureDesc: "QBER হার {percent}%। Alice এবং Bob সফলভাবে তাদের কিউবিট সারিবদ্ধ করেছেন।",
    recKey: "সারিবদ্ধ কোয়ান্টাম কী (বাইনারি)",
    copyKey: "কী কপি করুন",
    copied: "অনুলিপি করা হয়েছে!",
    
    // Locker Tab
    lockerTitle: "নিরাপদ ফাইল লকার",
    uploadBtn: "ফাইল আপলোড এবং এনক্রিপ্ট করুন",
    chooseFile: "ফাইল নির্বাচন করুন",
    enterKey: "কোয়ান্টাম কী লিখুন (বাইনারি)",
    filesList: "আপনার এনক্রিপ্ট করা ফাইল",
    noFiles: "এখনও কোন ফাইল এনক্রিপ্ট করা হয়নি।",
    filenameCol: "ফাইলের নাম",
    ownerCol: "মালিক",
    dateCol: "তৈরির তারিখ",
    actionCol: "পদক্ষেপ",
    downloadBtn: "ডাউনলোড এবং ডিক্রিপ্ট",
    deleteBtn: "মুছে ফেলুন",
    decryptModalTitle: "সংরক্ষিত ফাইল ডিক্রিপ্ট করুন",
    decryptPrompt: "XOR ক্রিপ্টোগ্রাফি ব্যবহার করে ফাইল ডিক্রিপ্ট করুন।",
    decryptSubmit: "ডিক্রিপ্ট এবং ডাউনলোড",
    
    // Admin Tab
    adminTitle: "সিস্টেম অডিট লগ",
    dbBackupTitle: "ডাটাবেস ব্যাকআপ এবং পুনরুদ্ধার",
    backupDesc: "SQLite ডাটাবেস ব্যাকআপ ডাউনলোড করুন বা ব্যাকআপ ফাইল থেকে পুনরুদ্ধার করুন।",
    downloadBackupBtn: "ডাটাবেস ব্যাকআপ ডাউনলোড করুন",
    restoreBackupBtn: "পুনরুদ্ধার করুন",
    restorePrompt: "পুনরুদ্ধার করতে বৈধ .db ব্যাকআপ ফাইল আপলোড করুন।",
    logId: "লগ আইডি",
    logUser: "ব্যবহারকারী",
    logAction: "পদক্ষেপ",
    logDetails: "বিস্তারিত",
    logTime: "টাইমস্ট্যাম্প",
    
    // Profile Tab
    profileTitle: "ব্যবহারকারী প্রোফাইল সেটিংস",
    fullNameLabel: "সম্পূর্ণ নাম",
    usernameLabel: "ইউজারনেম / অ্যাক্সেস আইডি",
    roleLabel: "নিরাপত্তা ছাড়পত্র স্তর",
    passwordLabel: "নতুন পাসওয়ার্ড",
    saveBtn: "প্রোফাইল পরিবর্তন সংরক্ষণ করুন",
    createdAtLabel: "অ্যাকাউন্ট তৈরির সময়",
    subscriptionLabel: "সাবস্ক্রিপশন প্ল্যান টিয়ার",
    upgradeBtn: "সাবস্ক্রিপশন আপগ্রেড করুন",
    tierFree: "ফ্রি / বেসিক টিয়ার",
    tierPro: "প্রো অপারেশনাল টিয়ার",
    tierEnterprise: "এন্টারপ্রাইজ সেন্টিনেল টিয়ার",
    
    // Messenger
    messengerTitle: "কোয়ান্টাম নিরাপদ মেসেঞ্জার",
    tabEncrypt: "বার্তা এনক্রিপ্ট করুন",
    tabDecrypt: "সাইফারটেক্সট ডিক্রিপ্ট করুন",
    secretMsg: "গোপন বার্তা",
    cipherOut: "সাইফারটেক্সট (Base64)",
    copyCipher: "সাইফার কপি করুন",
    submitEncrypt: "বার্তা এনক্রিপ্ট করুন",
    submitDecrypt: "সাইফার ডিক্রিপ্ট করুন",
    decryptedTitle: "ডিক্রিপশন আউটপুট স্ট্রিম",
    decryptPlaceholder: "Base64 সাইফারটেক্সট লিখুন..."
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("preferred_language") as Language;
    if (saved === "en" || saved === "es" || saved === "hi" || saved === "bn") {
      setLanguage(saved);
    }
  }, []);

  const toggleLanguage = () => {
    const languages: Language[] = ["en", "es", "hi", "bn"];
    const currentIdx = languages.indexOf(language);
    const next = languages[(currentIdx + 1) % languages.length];
    setLanguage(next);
    localStorage.setItem("preferred_language", next);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations["en"][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
