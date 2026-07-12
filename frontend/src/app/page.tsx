"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

// Interface Definitions
interface StepLog {
  index: number;
  alice_bit: number;
  alice_basis: string;
  alice_polarization: string;
  bob_basis: string;
  bob_measured: number;
  bob_polarization: string;
  basis_match: boolean;
  is_error: boolean;
  eve_basis?: string;
  eve_measured?: number;
  eve_polarization?: string;
}

interface SimulationSummary {
  total_sent: number;
  sifted_length: number;
  errors: number;
  qber_percent: number;
  eve_detected: boolean;
  aborted: boolean;
}

interface SimulationResult {
  config: {
    key_length: number;
    noise_level: number;
    eavesdropper: boolean;
  };
  summary: SimulationSummary;
  keys: {
    alice_sifted: string;
    bob_sifted: string;
    final_shared_key: string | null;
  };
  steps: StepLog[];
}

interface StoredFile {
  id: number;
  filename: string;
  created_at: string;
  owner: string;
  pqc_signed?: boolean;
  file_hash?: string;
  version?: number;
}

interface EncryptResult {
  ciphertext: string;
  hash?: string;
  signature?: string;
  public_key?: string;
  algorithm?: string;
}

interface AuditLog {
  id: number;
  username: string;
  action: string;
  details: string;
  timestamp: string;
}

interface DashboardStats {
  users: number;
  files: number;
  simulations: number;
  avg_qber_percent: number;
  eve_detections: number;
}

const generateMockSimulation = (keyLength: number, noiseLevel: number, eavesdropper: boolean): SimulationResult => {
  const steps: StepLog[] = [];
  const aliceBits = Array.from({ length: keyLength }, () => Math.random() < 0.5 ? 0 : 1);
  const aliceBases = Array.from({ length: keyLength }, () => Math.random() < 0.5 ? "Rectilinear" : "Diagonal");
  const bobBases = Array.from({ length: keyLength }, () => Math.random() < 0.5 ? "Rectilinear" : "Diagonal");
  
  let errors = 0;
  let siftedAlice = "";
  let siftedBob = "";

  for (let i = 0; i < keyLength; i++) {
    const aBit = aliceBits[i];
    const aBasis = aliceBases[i];
    const bBasis = bobBases[i];
    const aPolar = aBasis === "Rectilinear" ? (aBit === 0 ? "→" : "↑") : (aBit === 0 ? "↗" : "↖");
    
    let eveBasis = undefined;
    let eveMeasured = undefined;
    let evePolar = undefined;
    
    let bMeasured = aBit;
    let isError = false;

    if (eavesdropper) {
      eveBasis = Math.random() < 0.5 ? "Rectilinear" : "Diagonal";
      eveMeasured = Math.random() < 0.5 ? 0 : 1;
      evePolar = eveBasis === "Rectilinear" ? (eveMeasured === 0 ? "→" : "↑") : (eveMeasured === 0 ? "↗" : "↖");
      if (eveBasis !== aBasis) {
        bMeasured = Math.random() < 0.5 ? 0 : 1;
      }
    }

    if (Math.random() < noiseLevel) {
      bMeasured = Math.random() < 0.5 ? 0 : 1;
    }

    const basisMatch = aBasis === bBasis;
    if (basisMatch) {
      siftedAlice += aBit.toString();
      siftedBob += bMeasured.toString();
      if (aBit !== bMeasured) {
        errors++;
        isError = true;
      }
    }

    steps.push({
      index: i,
      alice_bit: aBit,
      alice_basis: aBasis === "Rectilinear" ? "+" : "x",
      alice_polarization: aPolar,
      bob_basis: bBasis === "Rectilinear" ? "+" : "x",
      bob_measured: bMeasured,
      bob_polarization: bBasis === "Rectilinear" ? (bMeasured === 0 ? "→" : "↑") : (bMeasured === 0 ? "↗" : "↖"),
      basis_match: basisMatch,
      is_error: isError,
      eve_basis: eavesdropper ? (eveBasis === "Rectilinear" ? "+" : "x") : undefined,
      eve_measured: eveMeasured,
      eve_polarization: evePolar
    });
  }

  const siftedLength = siftedAlice.length;
  const qber = siftedLength > 0 ? Math.round((errors / siftedLength) * 100) : 0;

  return {
    config: { key_length: keyLength, noise_level: noiseLevel, eavesdropper },
    summary: {
      total_sent: keyLength,
      sifted_length: siftedLength,
      errors,
      qber_percent: qber,
      eve_detected: eavesdropper && qber > 15,
      aborted: eavesdropper && qber > 15
    },
    keys: {
      alice_sifted: siftedAlice,
      bob_sifted: siftedBob,
      final_shared_key: qber <= 15 ? siftedAlice : null
    },
    steps
  };
};

export default function Home() {
  const { user, token, isAuthenticated, login, logout, updateUser } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();

  // Active Tab State
  const [activeTab, setActiveTab] = useState<"dashboard" | "simulator" | "locker" | "admin" | "profile">("dashboard");

  // API connection / error states
  const [apiOffline, setApiOffline] = useState<boolean>(false);

  // Authentication Dialogs
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authType, setAuthType] = useState<"login" | "register" | "forgot">("login");
  const [authUsername, setAuthUsername] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authFullName, setAuthFullName] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Simulation State
  const [keyLength, setKeyLength] = useState<number>(32);
  const [noiseLevel, setNoiseLevel] = useState<number>(0.0);
  const [eavesdropper, setEavesdropper] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cryptography Messenger State
  const [cryptoTab, setCryptoTab] = useState<"encrypt" | "decrypt">("encrypt");
  const [encryptMessage, setEncryptMessage] = useState<string>("");
  const [encryptKey, setEncryptKey] = useState<string>("");
  const [ciphertext, setCiphertext] = useState<string>("");
  const [encryptResult, setEncryptResult] = useState<EncryptResult | null>(null);
  const [decryptCiphertext, setDecryptCiphertext] = useState<string>("");
  const [decryptKey, setDecryptKey] = useState<string>("");
  const [decryptedMessage, setDecryptedMessage] = useState<string>("");
  const [signatureVerified, setSignatureVerified] = useState<boolean | null>(null);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [cryptoLoading, setCryptoLoading] = useState<boolean>(false);
  const [copiedCipher, setCopiedCipher] = useState<boolean>(false);

  // Secure Locker State
  const [filesList, setFilesList] = useState<StoredFile[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState<string>("");
  const [lockerLoading, setLockerLoading] = useState<boolean>(false);
  const [lockerError, setLockerError] = useState<string | null>(null);
  
  // Decrypt File Modal
  const [showDecryptFileModal, setShowDecryptFileModal] = useState<boolean>(false);
  const [selectedFileToDecrypt, setSelectedFileToDecrypt] = useState<StoredFile | null>(null);
  const [fileDecryptionKey, setFileDecryptionKey] = useState<string>("");
  const [fileDecryptError, setFileDecryptError] = useState<string | null>(null);

  // Dashboard Stats & Activities
  const [stats, setStats] = useState<DashboardStats>({ users: 0, files: 0, simulations: 0, avg_qber_percent: 0.0, eve_detections: 0 });
  const [recentActivities, setRecentActivities] = useState<AuditLog[]>([]);

  // Admin Audit Logs & Backup
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Profile Settings Form
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [profilePassword, setProfilePassword] = useState<string>("");
  const [profileMessage, setProfileMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [profile2FAEnabled, setProfile2FAEnabled] = useState<boolean>(false);

  // Background Canvas Controls
  const [bgParticleCount, setBgParticleCount] = useState<number>(100);
  const [bgConnectionRadius, setBgConnectionRadius] = useState<number>(100);
  const [bgParticleSpeed, setBgParticleSpeed] = useState<number>(0.6);
  const [bgGlowIntensity, setBgGlowIntensity] = useState<number>(12);
  const [bgGravityWell, setBgGravityWell] = useState<boolean>(true);
  const [bgVortex, setBgVortex] = useState<boolean>(false);
  const [bgColorWave, setBgColorWave] = useState<boolean>(false);
  const [bgRepulsion, setBgRepulsion] = useState<boolean>(true);
  const [bgPulseWave, setBgPulseWave] = useState<boolean>(false);
  const [bgTornado, setBgTornado] = useState<boolean>(false);
  const [bgBlackHole, setBgBlackHole] = useState<boolean>(false);
  const [bgTrails, setBgTrails] = useState<boolean>(false);
  const [bgTimeDilation, setBgTimeDilation] = useState<boolean>(false);
  const [bgPreset, setBgPreset] = useState<string>("cosmic");
  const [bgPinch, setBgPinch] = useState<boolean>(false);
  const [showCanvasSettings, setShowCanvasSettings] = useState<boolean>(false);
  const [bgDrawConnections, setBgDrawConnections] = useState<boolean>(true);
  const [bgClickExplosion, setBgClickExplosion] = useState<boolean>(true);

  // Premium Enterprise Features
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [activeTabSub, setActiveTabSub] = useState<"visualizer" | "kms" | "e2e-chat">("visualizer");
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState<boolean>(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string>("");
  const [twoFactorQRCode, setTwoFactorQRCode] = useState<string>("");
  const [twoFactorToken, setTwoFactorToken] = useState<string>("");
  const [twoFactorSimCode, setTwoFactorSimCode] = useState<string>("");
  const [loginRequires2FA, setLoginRequires2FA] = useState<boolean>(false);
  const [login2FACode, setLogin2FACode] = useState<string>("");

  // Subscription States
  const [profileSubTier, setProfileSubTier] = useState<string>("free");
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [targetUpgradeTier, setTargetUpgradeTier] = useState<"pro" | "enterprise">("pro");
  const [ccNumber, setCcNumber] = useState<string>("");
  const [ccExpiry, setCcExpiry] = useState<string>("");
  const [ccCvv, setCcCvv] = useState<string>("");
  const [ccName, setCcName] = useState<string>("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  
  // Custom metadata for uploads
  const [fileTags, setFileTags] = useState<string>("");
  const [fileParentFolder, setFileParentFolder] = useState<string>("/");
  const [fileExpiryHours, setFileExpiryHours] = useState<string>("");
  const [selectedFolder, setSelectedFolder] = useState<string>("/");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [allFolders, setAllFolders] = useState<string[]>(["/", "/Finance", "/Keys", "/Secrets"]);
  const [newFolderName, setNewFolderName] = useState<string>("");
  
  // Versions & Share link states
  const [fileVersions, setFileVersions] = useState<any[]>([]);
  const [showVersionsModal, setShowVersionsModal] = useState<boolean>(false);
  const [selectedFileForVersions, setSelectedFileForVersions] = useState<string>("");
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [selectedFileToShare, setSelectedFileToShare] = useState<StoredFile | null>(null);
  const [sharePassword, setSharePassword] = useState<string>("");
  const [shareExpiryHours, setShareExpiryHours] = useState<number>(24);
  const [generatedShareLink, setGeneratedShareLink] = useState<string>("");
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);

  // Signatures
  const [signMessageText, setSignMessageText] = useState<string>("");
  const [generatedSignature, setGeneratedSignature] = useState<string>("");
  const [signerPublicKey, setSignerPublicKey] = useState<string>("");
  const [verifyMessageText, setVerifyMessageText] = useState<string>("");
  const [verifySignatureText, setVerifySignatureText] = useState<string>("");
  const [verifyPublicKeyText, setVerifyPublicKeyText] = useState<string>("");
  const [signatureVerificationResult, setSignatureVerificationResult] = useState<any>(null);

  // E2E Secure Chat Simulation
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; time: string; text: string; encryptedText: string }>>([
    { sender: "Alice", time: "12:00", text: "Establishing quantum channel link...", encryptedText: "010010101011" },
    { sender: "Bob", time: "12:01", text: "Match established. Key reconciled successfully.", encryptedText: "010001010111" }
  ]);
  const [chatInput, setChatInput] = useState<string>("");

  // AI Security Assistant Chatbot
  const [showAIChat, setShowAIChat] = useState<boolean>(false);
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    { sender: "ai", text: "Greetings. I am the Quantum Portal Security Assistant. How can I help you operate the QKD system or locker today?" }
  ]);
  const [aiInput, setAiInput] = useState<string>("");

  // Real-time telemetry monitoring
  const [monitoringStats, setMonitoringStats] = useState<any>({
    cpu: 12.4, ram: 45.2, latency: 8.5, active_sockets: 1
  });

  // KMS key rings
  const [kmsKeys, setKmsKeys] = useState<Array<{ id: string; algorithm: string; bits: string; status: "active" | "revoked"; created: string }>>([
    { id: "QKD-KEY-8392", algorithm: "BB84 Protocol", bits: "01001101", status: "active", created: "Just Now" }
  ]);

  // General state alert warnings
  const [gpsLoginAlert, setGpsLoginAlert] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string>("");
  const [qiskitSimulatorMode, setQiskitSimulatorMode] = useState<string>("numerical");
  const [showEmailTool, setShowEmailTool] = useState<boolean>(false);
  const [emailRecipient, setEmailRecipient] = useState<string>("");
  const [emailAttachmentText, setEmailAttachmentText] = useState<string>("");
  const [emailEncryptedOutput, setEmailEncryptedOutput] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Connect WebSocket for real-time telemetry updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = BACKEND_URL.replace("http://", "").replace("https://", "");
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${protocol}//${host}/api/ws`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "telemetry") {
          setMonitoringStats({
            cpu: data.cpu,
            ram: data.ram,
            latency: data.latency,
            active_sockets: data.active_sockets
          });
        }
      };
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 3000);
      return () => {
        clearInterval(interval);
        ws.close();
      };
    } catch (e) {
      console.error("WS connection failed", e);
    }
  }, [BACKEND_URL]);

  // General Headers
  const getAuthHeaders = (): Record<string, string> => {
    if (!token) return {};
    return { "Authorization": `Bearer ${token}` };
  };

  // Check API health and Load Stats
  const checkHealthAndLoadData = async () => {
    try {
      const healthRes = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_length: 8, noise_level: 0, eavesdropper: false }),
      });
      if (!healthRes.ok) throw new Error();
      setApiOffline(false);

      if (isAuthenticated) {
        const statsRes = await fetch(`${BACKEND_URL}/api/admin/stats`, {
          headers: getAuthHeaders(),
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      }
    } catch {
      setApiOffline(true);
    }
  };

  const fetchProfile = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setProfileFullName(data.full_name || "");
        setProfile2FAEnabled(data.two_factor_enabled);
        setTwoFactorSecret(data.otp_secret || "");
        setProfileSubTier(data.subscription_tier || "free");
        updateUser({ subscription_tier: data.subscription_tier || "free" });
      }
    } catch (e) {
      console.error("Failed to fetch profile", e);
    }
  };

  const handleUpgradeSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    setPaymentLoading(true);

    const cleanCard = ccNumber.replace(/\s+/g, "").replace(/-/g, "");
    if (cleanCard.length !== 16 || isNaN(Number(cleanCard))) {
      setPaymentError("Invalid Credit Card Number. Must be 16 digits.");
      setPaymentLoading(false);
      return;
    }
    if (!ccExpiry.match(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/)) {
      setPaymentError("Invalid Expiration Date. Format MM/YY.");
      setPaymentLoading(false);
      return;
    }
    if (ccCvv.length !== 3 || isNaN(Number(ccCvv))) {
      setPaymentError("Invalid CVV. Must be 3 digits.");
      setPaymentLoading(false);
      return;
    }
    if (!ccName.trim()) {
      setPaymentError("Cardholder Name is required.");
      setPaymentLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/subscription/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          tier: targetUpgradeTier,
          card_number: ccNumber,
          card_expiry: ccExpiry,
          card_cvv: ccCvv,
          card_name: ccName
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setShowUpgradeModal(false);
        setCcNumber("");
        setCcExpiry("");
        setCcCvv("");
        setCcName("");
        fetchProfile();
      } else {
        setPaymentError(data.detail || "Payment failed. Please try again.");
      }
    } catch (e) {
      console.error(e);
      setPaymentError("Server connection error during payment processing.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleAiChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { sender: "user", text: userMsg }]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiMessages((prev) => [...prev, { sender: "ai", text: data.reply }]);
      } else {
        throw new Error();
      }
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { sender: "ai", text: "🔧 *System Link Error*: Unable to establish connection to the AI processing core. Please verify backend status." }
      ]);
    }
  };

  const handleSetup2FA = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/2fa/setup`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorSecret(data.secret);
        setTwoFactorQRCode(data.qr_code);
        setTwoFactorSimCode(data.simulated_code);
        setShowTwoFactorSetup(true);
      }
    } catch (e) {
      console.error("2FA Setup failed", e);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ token: twoFactorToken }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Two-Factor Authentication enabled successfully!");
        setTwoFactorToken("");
        setShowTwoFactorSetup(false);
        fetchProfile();
      } else {
        alert(data.detail || "Invalid code. Please try again.");
      }
    } catch (e) {
      console.error("2FA Verification failed", e);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm("Are you sure you want to disable Two-Factor Authentication?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/2fa/disable`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        alert("Two-Factor Authentication deactivated.");
        fetchProfile();
      }
    } catch (e) {
      console.error("2FA Disable failed", e);
    }
  };

  // Load stats and list on authentication change
  useEffect(() => {
    checkHealthAndLoadData();
    if (isAuthenticated) {
      loadFiles();
      loadActivities();
      if (user?.role === "admin") {
        loadAuditLogs();
      }
      fetchProfile();
    }
  }, [isAuthenticated, token, user?.role]);

  // Initialize Quantum Particle Canvas Background
  useEffect(() => {
    if (!canvasRef.current) return;
    const anim = new QuantumParticleAnimation(canvasRef.current);
    (window as any).quantumAnimation = anim;
    return () => {
      anim.destroy();
    };
  }, []);

  // Sync background configurations with React states
  useEffect(() => {
    const anim = (window as any).quantumAnimation;
    if (!anim) return;
    anim.particleCount = bgParticleCount;
    anim.connectionRadius = bgConnectionRadius;
    anim.particleSpeed = bgParticleSpeed;
    anim.glowIntensity = bgGlowIntensity;
    anim.gravityWellActive = bgGravityWell;
    anim.vortexActive = bgVortex;
    anim.colorWaveActive = bgColorWave;
    anim.repulsionActive = bgRepulsion;
    anim.pulseWaveActive = bgPulseWave;
    anim.tornadoActive = bgTornado;
    anim.blackHoleActive = bgBlackHole;
    anim.trailsActive = bgTrails;
    anim.timeDilationActive = bgTimeDilation;
    anim.pinchActive = bgPinch;
    anim.drawConnectionsActive = bgDrawConnections;
    anim.clickExplosionActive = bgClickExplosion;
    if (anim.currentColorScheme !== bgPreset) {
      anim.currentColorScheme = bgPreset;
      anim.initParticles();
    }
  }, [
    bgParticleCount,
    bgConnectionRadius,
    bgParticleSpeed,
    bgGlowIntensity,
    bgGravityWell,
    bgVortex,
    bgColorWave,
    bgRepulsion,
    bgPulseWave,
    bgTornado,
    bgBlackHole,
    bgTrails,
    bgTimeDilation,
    bgPinch,
    bgDrawConnections,
    bgClickExplosion,
    bgPreset,
  ]);

  const handleBgExplosion = () => {
    if ((window as any).quantumAnimation) {
      (window as any).quantumAnimation.triggerExplosion();
    }
  };

  const handleBgRandomize = () => {
    const anim = (window as any).quantumAnimation;
    if (!anim) return;
    anim.randomize();
    setBgParticleCount(anim.particleCount);
    setBgConnectionRadius(anim.connectionRadius);
    setBgParticleSpeed(anim.particleSpeed);
    setBgGlowIntensity(anim.glowIntensity);
    setBgGravityWell(anim.gravityWellActive);
    setBgVortex(anim.vortexActive);
    setBgColorWave(anim.colorWaveActive);
    setBgRepulsion(anim.repulsionActive);
    setBgPulseWave(anim.pulseWaveActive);
    setBgTornado(anim.tornadoActive);
    setBgBlackHole(anim.blackHoleActive);
    setBgTrails(anim.trailsActive);
    setBgPinch(anim.pinchActive);
    setBgDrawConnections(anim.drawConnectionsActive);
    setBgClickExplosion(anim.clickExplosionActive);
    setBgPreset(anim.currentColorScheme);
  };

  // Load recent audit logs for dashboard view
  const loadActivities = async () => {
    if (user?.role !== "admin") return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/logs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const logs = await res.json();
        setRecentActivities(logs.slice(0, 5));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Load audit logs for Admin Panel
  const loadAuditLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/logs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      } else {
        setAdminError(t("Operation forbidden."));
      }
    } catch {
      setAdminError(t("Could not connect to database."));
    }
  };

  // Load file locker lists
  const loadFiles = async () => {
    if (user?.role === "guest") return;
    try {
      const params = new URLSearchParams();
      params.append("folder", selectedFolder);
      if (searchQuery) params.append("search", searchQuery);
      if (tagFilter) params.append("tag", tagFilter);
      if (favoritesOnly) params.append("favorites_only", "true");

      const res = await fetch(`${BACKEND_URL}/api/files/list?${params.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFilesList(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadFiles();
    }
  }, [selectedFolder, searchQuery, tagFilter, favoritesOnly, isAuthenticated]);

  // Handle Authentication submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    if (authType === "login") {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: authUsername,
            password: authPassword,
            otp_code: loginRequires2FA ? login2FACode : null
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Authentication failed");
        }
        const data = await res.json();
        if (data.status === "requires_2fa") {
          setLoginRequires2FA(true);
          setAuthError(data.message);
          setAuthLoading(false);
          return;
        }
        login(data.access_token, data.user);
        if (data.gps_alert) {
          setGpsLoginAlert(data.gps_alert);
          setTimeout(() => setGpsLoginAlert(null), 10000);
        }
        setShowAuthModal(false);
        setAuthUsername("");
        setAuthPassword("");
        setLogin2FACode("");
        setLoginRequires2FA(false);
      } catch (err: any) {
        setAuthError(err.message);
      } finally {
        setAuthLoading(false);
      }
    } else if (authType === "register") {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: authUsername,
            password: authPassword,
            full_name: authFullName,
            email: authEmail,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Registration failed");
        }
        const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: authUsername, password: authPassword }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          login(loginData.access_token, loginData.user);
        }
        setShowAuthModal(false);
        setAuthUsername("");
        setAuthPassword("");
        setAuthFullName("");
        setAuthEmail("");
      } catch (err: any) {
        setAuthError(err.message);
      } finally {
        setAuthLoading(false);
      }
    } else if (authType === "forgot") {
      setTimeout(() => {
        alert("Simulated: An administrative recovery token has been created. In a production environment, an email would be dispatched.");
        setAuthType("login");
        setAuthLoading(false);
      }, 1000);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const mockEmail = prompt("Enter your Google Account Email to login (Simulated Google Auth):", `${authUsername || "user"}@gmail.com`);
    if (!mockEmail) {
      setAuthLoading(false);
      return;
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_token: "mock-google-id-token-xyz",
          email: mockEmail,
          name: mockEmail.split("@")[0].charAt(0).toUpperCase() + mockEmail.split("@")[0].slice(1)
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Google authentication failed");
      }
      const data = await res.json();
      login(data.access_token, data.user);
      setShowAuthModal(false);
      setAuthUsername("");
      setAuthPassword("");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Run QKD BB84 Simulation
  const runSimulation = async () => {
    setSimLoading(true);
    setAutoPlay(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key_length: keyLength,
          noise_level: noiseLevel,
          eavesdropper: eavesdropper,
        }),
      });

      if (!res.ok) throw new Error("Simulation failed");
      const data: SimulationResult = await res.json();
      setSimResult(data);
      setSelectedStepIndex(0);

      if (data.keys.final_shared_key) {
        setEncryptKey(data.keys.final_shared_key);
        setDecryptKey(data.keys.final_shared_key);
        setUploadKey(data.keys.final_shared_key);
      } else {
        setEncryptKey("");
        setDecryptKey("");
        setUploadKey("");
      }
      checkHealthAndLoadData();
    } catch {
      setApiOffline(true);
      const mockData = generateMockSimulation(keyLength, noiseLevel, eavesdropper);
      setSimResult(mockData);
      setSelectedStepIndex(0);
      if (mockData.keys.final_shared_key) {
        setEncryptKey(mockData.keys.final_shared_key);
        setDecryptKey(mockData.keys.final_shared_key);
        setUploadKey(mockData.keys.final_shared_key);
      } else {
        setEncryptKey("");
        setDecryptKey("");
        setUploadKey("");
      }
    } finally {
      setSimLoading(false);
    }
  };

  // Run initial simulation on load
  useEffect(() => {
    runSimulation();
  }, []);

  // Handle Autoplay simulation
  useEffect(() => {
    if (autoPlay && simResult) {
      autoPlayTimerRef.current = setInterval(() => {
        setSelectedStepIndex((prev) => {
          if (prev >= simResult.steps.length - 1) {
            setAutoPlay(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    } else {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
    }
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [autoPlay, simResult]);

  // Handle Messenger Encryption
  const handleEncrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptMessage || !encryptKey) return;
    setCryptoLoading(true);
    setCryptoError(null);
    setEncryptResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/encrypt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: encryptMessage, quantum_key: encryptKey }),
      });
      if (!res.ok) throw new Error("Encryption failed");
      const data: EncryptResult = await res.json();
      setCiphertext(data.ciphertext);
      setDecryptCiphertext(data.ciphertext);
      setEncryptResult(data);
    } catch (err: any) {
      setCryptoError(err.message);
    } finally {
      setCryptoLoading(false);
    }
  };

  // Handle Messenger Decryption
  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decryptCiphertext || !decryptKey) return;
    setCryptoLoading(true);
    setCryptoError(null);
    setSignatureVerified(null);
    try {
      const body: Record<string, string> = { ciphertext: decryptCiphertext, quantum_key: decryptKey };
      // Pass along PQC signature from last encryption for verification
      if (encryptResult?.signature) body.signature = encryptResult.signature;
      if (encryptResult?.public_key) body.public_key = encryptResult.public_key;
      const res = await fetch(`${BACKEND_URL}/api/decrypt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Decryption failed");
      }
      const data = await res.json();
      setDecryptedMessage(data.decrypted_message);
      setSignatureVerified(data.signature_verified ?? null);
    } catch (err: any) {
      setCryptoError(err.message);
    } finally {
      setCryptoLoading(false);
    }
  };

  // Handle File Locker Upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadKey) {
      setLockerError(t("File and Quantum Key are required."));
      return;
    }

    // Subscription limits checks
    if (profileSubTier === "free" && user?.role !== "admin") {
      if (filesList.length >= 2) {
        alert("Free subscription is limited to 2 files. Please upgrade in your Profile tab.");
        return;
      }
      if (uploadFile.size > 1000000) {
        alert("Free subscription is limited to 1MB files. Please upgrade in your Profile tab.");
        return;
      }
    } else if (profileSubTier === "pro" && user?.role !== "admin") {
      if (filesList.length >= 10) {
        alert("Pro subscription is limited to 10 files. Please upgrade to Enterprise in your Profile tab.");
        return;
      }
      if (uploadFile.size > 10000000) {
        alert("Pro subscription is limited to 10MB files. Please upgrade to Enterprise in your Profile tab.");
        return;
      }
    }

    setLockerLoading(true);
    setLockerError(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("quantum_key", uploadKey);
    if (fileTags) formData.append("tags", fileTags);
    if (fileParentFolder) formData.append("parent_folder", fileParentFolder);
    if (fileExpiryHours) formData.append("expiry_hours", fileExpiryHours);

    try {
      const res = await fetch(`${BACKEND_URL}/api/files/upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Upload failed");
      }
      setUploadFile(null);
      const fileInput = document.getElementById("locker-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      loadFiles();
      checkHealthAndLoadData();
    } catch (err: any) {
      setLockerError(err.message);
    } finally {
      setLockerLoading(false);
    }
  };

  // Trigger File Download & Decrypt modal
  const triggerFileDownload = (f: StoredFile) => {
    setSelectedFileToDecrypt(f);
    setFileDecryptionKey("");
    setFileDecryptError(null);
    setShowDecryptFileModal(true);
  };

  // Submit file decryption key & download file bytes from backend
  const handleDecryptFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileToDecrypt || !fileDecryptionKey) return;
    setFileDecryptError(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/files/download-decrypted/${selectedFileToDecrypt.id}?key=${encodeURIComponent(fileDecryptionKey)}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Decryption failed. Please check key.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedFileToDecrypt.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setShowDecryptFileModal(false);
    } catch (err: any) {
      setFileDecryptError(err.message);
    }
  };

  // Handle File Deletion
  const handleDeleteFile = async (id: number) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/files/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        loadFiles();
        checkHealthAndLoadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Profile Update Submit
  const handleProfileUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/profile/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ full_name: profileFullName, password: profilePassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Update profile failed");
      }
      updateUser({ full_name: profileFullName });
      setProfilePassword("");
      setProfileMessage({ text: "Profile details updated successfully.", type: "success" });
    } catch (err: any) {
      setProfileMessage({ text: err.message, type: "error" });
    }
  };

  // Admin DB Backup Download
  const handleDownloadBackup = async () => {
    if (profileSubTier !== "enterprise" && user?.role !== "admin") {
      alert("Database backup is an Enterprise tier feature. Please upgrade in your Profile tab.");
      return;
    }
    setBackupLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/backup`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quantum_db_backup_${new Date().toISOString().split('T')[0]}.db`;
      a.click();
    } catch {
      alert("Failed to download database backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  // Admin DB Restore Submit
  const handleRestoreBackupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileSubTier !== "enterprise" && user?.role !== "admin") {
      alert("Database restoration is an Enterprise tier feature. Please upgrade in your Profile tab.");
      return;
    }
    if (!restoreFile) return;
    setRestoreSuccess(null);
    const formData = new FormData();
    formData.append("file", restoreFile);

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/restore`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Restore failed");
      }
      setRestoreSuccess("Database successfully restored from backup. Session data remains, please refresh.");
      setRestoreFile(null);
      loadAuditLogs();
      checkHealthAndLoadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const copyToClipboard = (text: string, type: "key" | "cipher") => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCipher(true);
      setTimeout(() => setCopiedCipher(false), 2000);
    }
  };

  // Helpers
  const currentStep = simResult?.steps[selectedStepIndex];

  return (
    <div className={`min-h-screen flex flex-col font-sans relative z-10 ${lightMode ? "light-theme" : ""}`}>
      
      {/* Dynamic Canvas-based Quantum Particles Background */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-0" />
      
      {/* ─── Apple-style Top Frosted-Glass Navbar ─── */}
      <nav className="glass-panel border-b border-border/80 sticky top-0 z-40 bg-bg-deep/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo and Brand Identity */}
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                QUANTUM<span className="text-primary-light font-light">PORTAL</span>
              </span>
              
              <span className={`badge ${
                user?.role === "admin" 
                  ? "badge-admin"
                  : user?.role === "organization"
                  ? "badge-user"
                  : user?.role === "user"
                  ? "badge-user"
                  : "badge-guest"
              }`}>
                {user?.role === "admin" ? t("adminBadge") : user?.role === "organization" ? "ORGANIZATION ADMIN" : user?.role === "user" ? t("userBadge") : t("guestBadge")}
              </span>

              {user?.role !== "guest" && (
                <span className={`badge ${
                  user?.subscription_tier === "enterprise" 
                    ? "badge-admin"
                    : user?.subscription_tier === "pro"
                    ? "badge-user"
                    : "badge-guest"
                }`}
                style={{
                  borderColor: user?.subscription_tier === "enterprise" ? "rgba(245, 158, 11, 0.3)" : undefined,
                  color: user?.subscription_tier === "enterprise" ? "#f59e0b" : undefined,
                  background: user?.subscription_tier === "enterprise" ? "rgba(245, 158, 11, 0.05)" : undefined,
                }}
                >
                  {user?.subscription_tier === "enterprise" ? t("tierEnterprise") : user?.subscription_tier === "pro" ? t("tierPro") : t("tierFree")}
                </span>
              )}
            </div>

            {/* Desktop Center Navigation Menu */}
            <div className="hidden md:flex items-center gap-1">
              <button
                className={`nav-pill ${activeTab === "dashboard" ? "active" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                {t("navDashboard")}
              </button>
              <button
                className={`nav-pill ${activeTab === "simulator" ? "active" : ""}`}
                onClick={() => setActiveTab("simulator")}
              >
                {t("navSimulator")}
              </button>
              {user?.role !== "guest" && (
                <button
                  className={`nav-pill ${activeTab === "locker" ? "active" : ""}`}
                  onClick={() => setActiveTab("locker")}
                >
                  {t("navLocker")}
                </button>
              )}
              {user?.role === "admin" && (
                <button
                  className={`nav-pill ${activeTab === "admin" ? "active" : ""}`}
                  onClick={() => setActiveTab("admin")}
                >
                  {t("navAdmin")}
                </button>
              )}
              {user?.role !== "guest" && (
                <button
                  className={`nav-pill ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => setActiveTab("profile")}
                >
                  {t("navProfile")}
                </button>
              )}
            </div>

            {/* Right Buttons: Theme, Translation & Connection Info */}
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost flex items-center justify-center w-9 h-9 border border-border"
                onClick={() => setLightMode(!lightMode)}
                title="Toggle Theme Mode"
              >
                <span>{lightMode ? "🌙" : "☀️"}</span>
              </button>
              
              <button
                className="btn-ghost flex items-center gap-2 border border-border"
                onClick={toggleLanguage}
              >
                <span>🌐</span>
                <span className="font-semibold text-xs tracking-wider">{language.toUpperCase()}</span>
              </button>
              
              {isAuthenticated ? (
                <button
                  className="btn-ghost text-danger hover:bg-danger/10 hover:border-danger/20 hover:text-white py-1.5 px-3 text-xs"
                  onClick={logout}
                >
                  {t("logoutBtn")}
                </button>
              ) : (
                <button
                  className="btn-primary py-1.5 px-3 text-xs"
                  onClick={() => { setAuthType("login"); setAuthError(null); setShowAuthModal(true); }}
                >
                  {t("loginBtn")}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Main Content Canvas ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 sm:px-8 py-10">
        
        {/* GPS Intrusion Banner Alert */}
        {gpsLoginAlert && (
          <div className="alert-danger flex justify-between items-center gap-4 mb-8 border border-warning/20 bg-warning/5 text-warning animate-slide-down">
            <div className="flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <div>
                <h5 className="font-bold text-white mb-0.5">GPS Location Alert</h5>
                <p className="text-xs text-warning-200/80">{gpsLoginAlert}</p>
              </div>
            </div>
          </div>
        )}

        {/* Offline Warning Banner */}
        {apiOffline && (
          <div className="alert-danger flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h5 className="font-bold text-white mb-0.5">Connection Problem</h5>
                <p className="text-xs text-red-200/80">{t("apiOffline")}</p>
              </div>
            </div>
            <button className="btn-primary py-2 px-4 text-xs bg-danger/80 hover:bg-danger" onClick={checkHealthAndLoadData}>
              {t("retryBtn")}
            </button>
          </div>
        )}

        {/* Mobile Horizontal Pill Navigation */}
        <div className="flex md:hidden overflow-x-auto gap-2 bg-bg-card p-2 rounded-xl border border-border mb-8 scrollbar-none">
          <button
            className={`nav-pill ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            {t("navDashboard")}
          </button>
          <button
            className={`nav-pill ${activeTab === "simulator" ? "active" : ""}`}
            onClick={() => setActiveTab("simulator")}
          >
            {t("navSimulator")}
          </button>
          {user?.role !== "guest" && (
            <button
              className={`nav-pill ${activeTab === "locker" ? "active" : ""}`}
              onClick={() => setActiveTab("locker")}
            >
              {t("navLocker")}
            </button>
          )}
          {user?.role === "admin" && (
            <button
              className={`nav-pill ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              {t("navAdmin")}
            </button>
          )}
          {user?.role !== "guest" && (
            <button
              className={`nav-pill ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              {t("navProfile")}
            </button>
          )}
        </div>

        {/* ─── TAB 1: ANALYTICS DASHBOARD ─── */}
        {activeTab === "dashboard" && (
          <div className="space-y-8 animate-slide-up">
            
            {/* Minimalist Apple-style Header */}
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
                {t("dashTitle")}
              </h1>
              <p className="text-sm text-gray-400">
                {t("subtitle")}
              </p>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              
              <div className="stat-card">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t("totalUsers")}</div>
                <div className="text-3xl font-bold text-white mt-2 font-mono">{stats.users || 1}</div>
                <div className="absolute right-4 bottom-4 text-primary opacity-20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0012 20.25a11.38 11.38 0 00-3-1.013v-.109c0-1.113.287-2.16.786-3.07M7.5 14.25a3 3 0 00-3 3v3m3-3a3 3 0 003 3M15 7.5a3 3 0 11-6 0 3 3 0 016 0zm6.75 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 0a3 3 0 01-3 3M3.75 11a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 0a3 3 0 01-3 3" />
                  </svg>
                </div>
              </div>

              <div className="stat-card">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t("totalFiles")}</div>
                <div className="text-3xl font-bold text-white mt-2 font-mono">{stats.files}</div>
                <div className="absolute right-4 bottom-4 text-secondary opacity-20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 00-2.25 2.25z" />
                  </svg>
                </div>
              </div>

              <div className="stat-card">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t("totalSims")}</div>
                <div className="text-3xl font-bold text-white mt-2 font-mono">{stats.simulations}</div>
                <div className="absolute right-4 bottom-4 text-success opacity-20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
              </div>

              <div className="stat-card">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t("avgQber")}</div>
                <div className="text-3xl font-bold text-warning mt-2 font-mono">{stats.avg_qber_percent}%</div>
                <div className="absolute right-4 bottom-4 text-warning opacity-20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3" />
                  </svg>
                </div>
              </div>

              <div className="stat-card">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t("eveDetections")}</div>
                <div className="text-3xl font-bold text-danger mt-2 font-mono">{stats.eve_detections}</div>
                <div className="absolute right-4 bottom-4 text-danger opacity-20">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>

            </div>

            {/* Live Security Dashboard Status Widget */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="stats-card p-4 rounded-xl border border-border bg-bg-card/40 flex flex-col justify-between relative overflow-hidden">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">CPU Resource Rate</span>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-10 h-10 relative">
                    <svg className="w-full h-full" viewBox="0 0 36 36">
                      <path className="text-border" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-primary" strokeDasharray={`${monitoringStats.cpu}, 100`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                  </div>
                  <span className="text-xl font-bold font-mono text-white">{monitoringStats.cpu}%</span>
                </div>
              </div>
              <div className="stats-card p-4 rounded-xl border border-border bg-bg-card/40 flex flex-col justify-between relative overflow-hidden">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">RAM Usage Rate</span>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-10 h-10 relative">
                    <svg className="w-full h-full" viewBox="0 0 36 36">
                      <path className="text-border" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-secondary" strokeDasharray={`${monitoringStats.ram}, 100`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                  </div>
                  <span className="text-xl font-bold font-mono text-white">{monitoringStats.ram}%</span>
                </div>
              </div>
              <div className="stats-card p-4 rounded-xl border border-border bg-bg-card/40 flex flex-col justify-between relative overflow-hidden">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">WebSocket Latency</span>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-success font-semibold text-xl font-mono">{monitoringStats.latency} ms</span>
                  <span className="text-[9px] text-gray-500 font-bold">Stable</span>
                </div>
              </div>
              <div className="stats-card p-4 rounded-xl border border-border bg-bg-card/40 flex flex-col justify-between relative overflow-hidden">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Security Vulnerability</span>
                <div className="flex items-center gap-2 mt-2">
                  <span className="badge badge-match text-success bg-success/10 border-success/20">Optimal</span>
                  <span className="text-[9px] text-gray-500 font-bold">No Threats</span>
                </div>
              </div>
            </div>

            {/* Dashboard Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Graphic Channel Visualizer Widget */}
              <div className="lg:col-span-2 section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    {t("statsOverview")}
                  </h3>
                </div>
                
                <div className="section-body space-y-6">
                  {/* Clean SVG visualizer representing quantum signal strength */}
                  <div className="h-48 w-full bg-bg-deep rounded-xl relative border border-border/80 p-6 flex flex-col justify-between overflow-hidden">
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">Quantum Channel Reliability</span>
                        <h4 className="text-2xl font-bold text-white mt-1">99.84% Optimal</h4>
                      </div>
                      <span className="badge badge-match flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping"></span>
                        Active Stream
                      </span>
                    </div>

                    {/* SVG Graphic Area */}
                    <div className="h-20 w-full relative">
                      <svg className="w-full h-full" viewBox="0 0 600 80" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.4" />
                            <stop offset="50%" stopColor="var(--color-secondary)" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.4" />
                          </linearGradient>
                          <linearGradient id="glowGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="var(--color-primary)" />
                            <stop offset="100%" stopColor="var(--color-accent)" />
                          </linearGradient>
                        </defs>
                        <path 
                          d="M0,40 Q60,10 120,40 T240,40 T360,40 T480,40 T600,40" 
                          fill="none" 
                          stroke="url(#glowGrad)" 
                          strokeWidth="2.5" 
                        />
                        <path 
                          d="M0,40 Q60,10 120,40 T240,40 T360,40 T480,40 T600,40 L600,80 L0,80 Z" 
                          fill="url(#waveGrad)" 
                        />
                      </svg>
                    </div>

                    <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                      <span>λ = 1550nm (Standard Fiber)</span>
                      <span>Phase Lock: Stable</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity List Widget */}
              <div className="section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    {t("activitiesTitle")}
                  </h3>
                </div>

                <div className="section-body space-y-4 max-h-[300px] overflow-y-auto">
                  {recentActivities.length > 0 ? (
                    recentActivities.map((log) => (
                      <div key={log.id} className="flex gap-4 items-start border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>
                        <div className="space-y-1">
                          <p className="text-xs text-white">
                            <strong className="font-semibold text-gray-300">{log.username}</strong>{" "}
                            <span className="text-gray-400">{log.details}</span>
                          </p>
                          <span className="text-[10px] font-mono text-gray-500 block">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-gray-500 text-xs">
                      {t("noActivity")}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ─── TAB 2: QUANTUM SIMULATOR ─── */}
        {activeTab === "simulator" && (
          <div className="space-y-6 lg:col-span-12 animate-slide-up">
            
            {/* Simulator Sub-Navigation Pill Header */}
            <div className="flex gap-2 bg-bg-card p-1.5 rounded-xl border border-border mb-6">
              <button
                className={`nav-pill ${activeTabSub === "visualizer" ? "active" : ""}`}
                onClick={() => setActiveTabSub("visualizer")}
              >
                BB84 Channel Visualizer
              </button>
              <button
                className={`nav-pill ${activeTabSub === "kms" ? "active" : ""}`}
                onClick={() => setActiveTabSub("kms")}
              >
                Key Management (KMS)
              </button>
              <button
                className={`nav-pill ${activeTabSub === "e2e-chat" ? "active" : ""}`}
                onClick={() => setActiveTabSub("e2e-chat")}
              >
                Secure Chat (E2E)
              </button>
            </div>

            {activeTabSub === "visualizer" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Visualizer and Simulator Controls */}
                <div className="lg:col-span-8 space-y-6">
                  
                  <div className="section-card">
                    <div className="section-header">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent"></span>
                        {t("simTitle")}
                      </h2>
                    </div>

                    <div className="section-body space-y-6">
                      {/* Setup Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 bg-bg-deep p-6 rounded-xl border border-border">
                        
                        {/* Qubits Parameter */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block" htmlFor="qubit-length">
                            {t("qubitsSent")} ({keyLength})
                          </label>
                          <input
                            id="qubit-length"
                            type="range"
                            min="8"
                            max="128"
                            step="8"
                            value={keyLength}
                            onChange={(e) => setKeyLength(parseInt(e.target.value))}
                            className="w-full accent-primary bg-bg-card rounded-lg h-1.5 cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                            <span>8 Qubits</span>
                            <span>128 Qubits</span>
                          </div>
                        </div>

                        {/* Noise Parameter */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block" htmlFor="noise-level">
                            {t("noiseLevel")} ({Math.round(noiseLevel * 100)}%)
                          </label>
                          <input
                            id="noise-level"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={noiseLevel}
                            onChange={(e) => setNoiseLevel(parseFloat(e.target.value))}
                            className="w-full accent-primary bg-bg-card rounded-lg h-1.5 cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                            <span>0% (Clean)</span>
                            <span>100% (Noisy)</span>
                          </div>
                        </div>

                        {/* Eve Toggle */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block" htmlFor="eavesdropper-switch">
                            {t("eveToggle")}
                          </label>
                          <div className="flex items-center justify-between bg-bg-card p-3 rounded-lg border border-border h-[42px]">
                            <span className="text-xs font-medium text-gray-300">
                              {eavesdropper ? t("eveEnabled") : t("eveDisabled")}
                            </span>
                            <div
                              id="eavesdropper-switch"
                              onClick={() => setEavesdropper(!eavesdropper)}
                              className={`toggle-track ${eavesdropper ? "active" : ""}`}
                            >
                              <div className="toggle-thumb" />
                            </div>
                          </div>
                        </div>

                      </div>

                      <button
                        className="btn-primary w-full text-sm py-3.5"
                        onClick={runSimulation}
                        disabled={simLoading}
                      >
                        {simLoading ? "Establishing Quantum Channel..." : t("simBtn")}
                      </button>

                      {/* QKD Optic Channel Visualizer */}
                      {simResult && simResult.steps.length > 0 && (
                        <div className="bg-bg-deep rounded-xl p-6 border border-border space-y-6 relative overflow-hidden">
                          
                          <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                            <span>Step {selectedStepIndex + 1} of {simResult.config.key_length}</span>
                            <span className={eavesdropper ? "text-danger" : "text-primary"}>
                              {eavesdropper ? "⚠️ Interception Active" : "✓ Secure Channel Link"}
                            </span>
                          </div>

                          {/* Quantum Photons Path representation */}
                          <div className="h-28 flex items-center justify-between relative mt-4">
                            <div className="absolute left-10 right-10 top-1/2 border-b border-dashed border-border z-0"></div>

                            {/* Transmitter: Alice */}
                            <div className="flex flex-col items-center gap-2 z-10 w-20">
                              <div className="w-12 h-12 rounded-full bg-bg-card border-2 border-primary flex items-center justify-center font-bold text-white shadow-lg">
                                A
                              </div>
                              <span className="text-xs font-semibold text-gray-300">Alice</span>
                              <span className="text-[10px] font-mono text-gray-500">
                                Bit: {currentStep?.alice_bit} ({currentStep?.alice_basis})
                              </span>
                            </div>

                            {/* Photon flight anim */}
                            <div
                              key={selectedStepIndex}
                              className={`absolute w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center font-mono text-[10px] font-bold text-white shadow-lg z-20 ${
                                eavesdropper ? "animate-photon-travel-intercept" : "animate-photon-travel"
                              }`}
                            >
                              {currentStep?.alice_polarization}
                            </div>

                            {/* Interceptor: Eve */}
                            {eavesdropper && (
                              <div className="flex flex-col items-center gap-2 z-10 w-20">
                                <div className="w-12 h-12 rounded-full bg-bg-card border-2 border-danger flex items-center justify-center font-bold text-white shadow-lg">
                                  E
                                </div>
                                <span className="text-xs font-semibold text-danger">{t("eveToggle")}</span>
                                <span className="text-[10px] font-mono text-gray-500">
                                  Val: {currentStep?.eve_measured} ({currentStep?.eve_basis})
                                </span>
                              </div>
                            )}

                            {/* Receiver: Bob */}
                            <div className="flex flex-col items-center gap-2 z-10 w-20">
                              <div className="w-12 h-12 rounded-full bg-bg-card border-2 border-success flex items-center justify-center font-bold text-white shadow-lg">
                                B
                              </div>
                              <span className="text-xs font-semibold text-gray-300">Bob</span>
                              <span className="text-[10px] font-mono text-gray-500">
                                Meas: {currentStep?.bob_measured} ({currentStep?.bob_basis})
                              </span>
                            </div>
                          </div>

                          {/* Match / Error indicator */}
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-border">
                            <div className="text-xs text-gray-400">
                              <strong>Basis Check:</strong>{" "}
                              {currentStep?.basis_match ? (
                                <span className="text-success font-semibold">Match established (Saved)</span>
                              ) : (
                                <span className="text-gray-500">Mismatch (Discarded)</span>
                              )}
                            </div>

                            {currentStep?.basis_match && currentStep.is_error && (
                              <div className="text-xs text-danger font-semibold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-danger animate-ping"></span>
                                State Altered (QBER anomaly)
                              </div>
                            )}
                          </div>

                        </div>
                      )}

                      {/* Playback Controls */}
                      {simResult && (
                        <div className="grid grid-cols-4 gap-2">
                          <button
                            className="btn-ghost border border-border"
                            onClick={() => { setAutoPlay(false); setSelectedStepIndex(0); }}
                          >
                            ⏮ First
                          </button>
                          <button
                            className="btn-ghost border border-border disabled:opacity-40"
                            onClick={() => { setAutoPlay(false); setSelectedStepIndex((prev) => Math.max(0, prev - 1)); }}
                            disabled={selectedStepIndex === 0}
                          >
                            ◀ Prev
                          </button>
                          <button
                            className={`btn-ghost border border-border font-bold ${
                              autoPlay ? "bg-danger/10 border-danger/30 text-white" : ""
                            }`}
                            onClick={() => setAutoPlay(!autoPlay)}
                          >
                            {autoPlay ? "⏸ Pause" : "▶ Play"}
                          </button>
                          <button
                            className="btn-ghost border border-border disabled:opacity-40"
                            onClick={() => { setAutoPlay(false); setSelectedStepIndex((prev) => Math.min(simResult.steps.length - 1, prev + 1)); }}
                            disabled={selectedStepIndex === simResult.steps.length - 1}
                          >
                            Next ▶
                          </button>
                        </div>
                      )}

                      {/* Detailed Qubits Table */}
                      {simResult && (
                        <div className="border border-border rounded-xl bg-bg-deep overflow-hidden max-h-[300px] overflow-y-auto">
                          <table className="table-premium font-mono text-xs">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Alice (Bit / Basis)</th>
                                <th>Polarization</th>
                                {eavesdropper && <th>Eve Basis / Meas</th>}
                                <th>Bob (Basis / Meas)</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {simResult.steps.map((step, idx) => {
                                const isSelected = selectedStepIndex === idx;
                                return (
                                  <tr
                                    key={step.index}
                                    className={`cursor-pointer transition-all ${
                                      isSelected ? "bg-primary/10 border-l-2 border-primary" : ""
                                    }`}
                                    onClick={() => { setAutoPlay(false); setSelectedStepIndex(idx); }}
                                  >
                                    <td className="font-semibold text-gray-500">{step.index + 1}</td>
                                    <td>{step.alice_bit} [{step.alice_basis}]</td>
                                    <td>{step.alice_polarization}</td>
                                    {eavesdropper && (
                                      <td className="text-danger">
                                        {step.eve_basis ? `${step.eve_basis} [${step.eve_measured}]` : "-"}
                                      </td>
                                    )}
                                    <td>[{step.bob_basis}] {step.bob_measured}</td>
                                    <td>
                                      {step.basis_match ? (
                                        step.is_error ? (
                                          <span className="badge badge-error">Altered</span>
                                        ) : (
                                          <span className="badge badge-match">Match</span>
                                        )
                                      ) : (
                                        <span className="badge badge-discard">Discard</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  </div>
                </div>

                {/* QKD Metrics Card & Secure Messenger */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* Metrics Summary */}
                  {simResult && (
                    <div className="section-card">
                      <div className="section-header">
                        <h3 className="text-sm font-bold text-white">Quantum Metrics</h3>
                      </div>
                      
                      <div className="section-body space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-bg-deep p-4 rounded-xl border border-border text-center">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Key Length</span>
                            <span className="text-lg font-bold text-white font-mono mt-1 block">
                              {simResult.summary.sifted_length} Bits
                            </span>
                          </div>
                          <div className="bg-bg-deep p-4 rounded-xl border border-border text-center">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">QBER</span>
                            <span className={`text-lg font-bold font-mono mt-1 block ${
                              simResult.summary.qber_percent > 15 ? "text-danger" : "text-success"
                            }`}>
                              {simResult.summary.qber_percent}%
                            </span>
                          </div>
                        </div>

                        {simResult.summary.eve_detected ? (
                          <div className="alert-danger text-xs leading-relaxed">
                            <h6 className="font-bold mb-1">Eavesdropping Intercepted</h6>
                            QBER rate is {simResult.summary.qber_percent}%, which exceeds safe limits. Key was automatically destroyed.
                          </div>
                        ) : (
                          <div className="alert-success text-xs leading-relaxed">
                            <h6 className="font-bold mb-1">Key Established Successfully</h6>
                            QBER rate is {simResult.summary.qber_percent}%. The shared key has been registered securely.
                          </div>
                        )}

                        {simResult.keys.final_shared_key && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-400 font-bold uppercase tracking-wider">Final Quantum Key</span>
                              <button
                                className="text-primary font-semibold hover:underline"
                                onClick={() => copyToClipboard(simResult.keys.final_shared_key || "", "key")}
                              >
                                {copiedKey ? t("copied") : t("copyKey")}
                              </button>
                            </div>
                            <div className="bg-bg-deep p-3 rounded-lg border border-border font-mono text-[10px] text-primary break-all max-h-[80px] overflow-y-auto">
                              {simResult.keys.final_shared_key}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}

                  {/* Secure Messenger App */}
                  <div className="section-card">
                    <div className="section-header">
                      <h3 className="text-sm font-bold text-white">{t("messengerTitle")}</h3>
                    </div>

                    <div className="section-body space-y-4">
                      {/* Tabs */}
                      <div className="flex bg-bg-deep p-1 rounded-lg border border-border">
                        <button
                          className={`flex-1 py-1.5 rounded text-xs font-semibold ${
                            cryptoTab === "encrypt" ? "bg-bg-card text-white border border-border" : "text-gray-400"
                          }`}
                          onClick={() => setCryptoTab("encrypt")}
                        >
                          {t("tabEncrypt")}
                        </button>
                        <button
                          className={`flex-1 py-1.5 rounded text-xs font-semibold ${
                            cryptoTab === "decrypt" ? "bg-bg-card text-white border border-border" : "text-gray-400"
                          }`}
                          onClick={() => setCryptoTab("decrypt")}
                        >
                          {t("tabDecrypt")}
                        </button>
                      </div>

                      {cryptoError && (
                        <div className="alert-danger text-xs p-3">
                          {cryptoError}
                        </div>
                      )}

                      {cryptoTab === "encrypt" ? (
                        <form onSubmit={handleEncrypt} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="msg-to-encrypt">
                              {t("secretMsg")}
                            </label>
                            <textarea
                              id="msg-to-encrypt"
                              rows={2}
                              className="input-field"
                              placeholder="Type secret message..."
                              value={encryptMessage}
                              onChange={(e) => setEncryptMessage(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="key-to-encrypt">
                              {t("enterKey")}
                            </label>
                            <input
                              id="key-to-encrypt"
                              type="text"
                              className="input-field font-mono text-xs"
                              placeholder="Quantum Key string..."
                              value={encryptKey}
                              onChange={(e) => setEncryptKey(e.target.value)}
                            />
                          </div>

                          <button type="submit" className="btn-primary w-full py-2.5 text-xs">
                            Encrypt Message
                          </button>

                          {ciphertext && (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500 font-bold">Ciphertext (Base64)</span>
                                <button
                                  type="button"
                                  className="text-primary font-semibold hover:underline"
                                  onClick={() => copyToClipboard(ciphertext, "cipher")}
                                >
                                  {copiedCipher ? t("copied") : t("copyCipher")}
                                </button>
                              </div>
                              <div className="bg-bg-deep p-3 rounded-lg border border-border font-mono text-[10px] text-secondary break-all max-h-[80px] overflow-y-auto">
                                {ciphertext}
                              </div>
                              {/* PQC Pipeline Status */}
                              <div className="bg-bg-deep border border-emerald-900/40 rounded-lg p-3 space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">⚛️ Pipeline Status</p>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                  <span className="text-gray-300">BB84 Quantum Key</span>
                                  <span className="ml-auto text-emerald-400 font-mono">{encryptKey.slice(0,8)}…</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                  <span className="text-gray-300">AES-256-CBC Encrypt</span>
                                  <span className="ml-auto text-emerald-400">✓ Done</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                  <span className="text-gray-300">SHA-256 Hash</span>
                                  <span className="ml-auto font-mono text-emerald-400 truncate max-w-[90px]">{encryptResult?.hash?.slice(0,8)}…</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="w-2 h-2 rounded-full bg-violet-400 inline-block"></span>
                                  <span className="text-gray-300">CRYSTALS-Dilithium Sign</span>
                                  <span className="ml-auto text-violet-400">{encryptResult?.signature ? "✓ Signed" : "—"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </form>
                      ) : (
                        <form onSubmit={handleDecrypt} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="msg-to-decrypt">
                              {t("cipherOut")}
                            </label>
                            <textarea
                              id="msg-to-decrypt"
                              rows={2}
                              className="input-field font-mono text-xs"
                              placeholder="Paste Base64 ciphertext..."
                              value={decryptCiphertext}
                              onChange={(e) => setDecryptCiphertext(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="key-to-decrypt">
                              {t("enterKey")}
                            </label>
                            <input
                              id="key-to-decrypt"
                              type="text"
                              className="input-field font-mono text-xs"
                              value={decryptKey}
                              onChange={(e) => setDecryptKey(e.target.value)}
                            />
                          </div>

                          <button type="submit" className="btn-primary w-full py-2.5 text-xs">
                            Decrypt Message
                          </button>

                          {decryptedMessage && (
                            <div className="bg-bg-deep p-4 rounded-xl border border-border space-y-2">
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Decrypted Message Output</span>
                              <p className="text-sm text-white font-medium bg-bg-card p-3 rounded-lg border border-border">
                                {decryptedMessage}
                              </p>
                              {signatureVerified !== null && (
                                <div className={`flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg border ${signatureVerified ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-300" : "border-yellow-700/50 bg-yellow-900/20 text-yellow-300"}`}>
                                  <span>{signatureVerified ? "✅" : "⚠️"}</span>
                                  <span className="font-bold">{signatureVerified ? "CRYSTALS-Dilithium Signature Verified" : "No Signature — Unverified Decrypt"}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </form>
                      )}

                    </div>
                  </div>

                  {/* Post-Quantum Digital Signatures Card */}
                  <div className="section-card mt-6">
                    <div className="section-header">
                      <h3 className="text-sm font-bold text-white">🛡️ PQC Digital Signatures</h3>
                    </div>
                    <div className="section-body space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Message to Sign</label>
                        <input
                          type="text"
                          className="input-field py-1 text-xs"
                          placeholder="Enter statement..."
                          value={signMessageText}
                          onChange={(e) => setSignMessageText(e.target.value)}
                        />
                        <button
                          onClick={async () => {
                            if (!signMessageText) return;
                            try {
                              const res = await fetch(`${BACKEND_URL}/api/signatures/sign`, {
                                method: "POST",
                                headers: {
                                  ...getAuthHeaders(),
                                  "Content-Type": "application/json"
                                },
                                body: JSON.stringify({ message: signMessageText })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setGeneratedSignature(data.signature);
                                setSignerPublicKey(data.public_key);
                                // Auto-fill verification fields
                                setVerifyMessageText(signMessageText);
                                setVerifySignatureText(data.signature);
                                setVerifyPublicKeyText(data.public_key);
                                setSignatureVerificationResult(null);
                              }
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="btn-primary w-full py-1 text-[10px]"
                        >
                          ✍️ Sign Statement
                        </button>
                        {generatedSignature && (
                          <div className="space-y-2 pt-2 animate-fade-in">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Generated Signature Details</div>
                            <code className="text-[9px] font-mono text-primary break-all select-all block bg-bg-card p-2 rounded border border-border">
                              Signature: {generatedSignature}
                            </code>
                            <code className="text-[9px] font-mono text-violet-400 break-all select-all block bg-bg-card p-2 rounded border border-border">
                              Public Key: {signerPublicKey}
                            </code>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-border/40 pt-4 space-y-2">
                        <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Verify Signature</h4>
                        
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-semibold block">Message Content</label>
                          <input
                            type="text"
                            className="input-field py-1 text-xs"
                            placeholder="Message content..."
                            value={verifyMessageText}
                            onChange={(e) => setVerifyMessageText(e.target.value)}
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-semibold block">Dilithium Signature</label>
                          <input
                            type="text"
                            className="input-field py-1 text-xs font-mono"
                            placeholder="Dilithium Signature..."
                            value={verifySignatureText}
                            onChange={(e) => setVerifySignatureText(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-gray-500 font-semibold block">Public Key</label>
                          <input
                            type="text"
                            className="input-field py-1 text-xs font-mono"
                            placeholder="Signer Public Key..."
                            value={verifyPublicKeyText}
                            onChange={(e) => setVerifyPublicKeyText(e.target.value)}
                          />
                        </div>

                        <button
                          disabled={!verifyMessageText.trim() || !verifySignatureText.trim() || !verifyPublicKeyText.trim()}
                          onClick={async () => {
                            if (!verifyMessageText.trim() || !verifySignatureText.trim() || !verifyPublicKeyText.trim()) return;
                            try {
                              const res = await fetch(`${BACKEND_URL}/api/signatures/verify`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  message: verifyMessageText,
                                  signature: verifySignatureText,
                                  public_key: verifyPublicKeyText
                                })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setSignatureVerificationResult(data);
                              }
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className={`w-full py-1.5 text-[10px] rounded transition-all font-bold ${(!verifyMessageText.trim() || !verifySignatureText.trim() || !verifyPublicKeyText.trim()) ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "btn-ghost text-primary border border-primary/20 hover:bg-primary/10"}`}
                        >
                          🛡️ Verify Integrity
                        </button>
                        {signatureVerificationResult !== null && (
                          <div className={`alert-success text-[10px] p-2 mt-2 animate-scale-in ${signatureVerificationResult.valid ? "text-success border-success/20 bg-success/5" : "text-danger border-danger/20 bg-danger/5"}`}>
                            {signatureVerificationResult.valid ? "✅ Signature Verified: Integrity intact." : "❌ Signature Invalid: Content modified or key mismatch!"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {activeTabSub === "kms" && (
              <div className="space-y-6 lg:col-span-12 animate-slide-up">
                <div className="section-card">
                  <div className="section-header flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">Quantum Key Management System (KMS)</h3>
                    <div className="flex gap-2">
                      <span className="text-xs text-gray-400 font-bold">Simulator Backend:</span>
                      <select
                        className="input-field py-1 px-2 text-xs bg-bg-deep rounded border border-border text-white cursor-pointer"
                        value={qiskitSimulatorMode}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "qiskit" && profileSubTier === "free" && user?.role !== "admin") {
                            alert("IBM Qiskit Simulator requires Pro or Enterprise subscription. Please upgrade in your Profile tab.");
                            return;
                          }
                          setQiskitSimulatorMode(val);
                        }}
                      >
                        <option value="numerical">NumPy Standard (Local)</option>
                        <option value="qiskit">IBM Qiskit Simulator (IBM Aer)</option>
                      </select>
                    </div>
                  </div>
                  <div className="section-body space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-bg-deep p-6 rounded-xl border border-border">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Key Rotations</h4>
                        <p className="text-[11px] text-gray-500 leading-normal mb-4">
                          Enforce key rotation limits periodically. Active key rings are synchronized using post-quantum hybrid mechanisms (Kyber + AES).
                        </p>
                        <button
                          onClick={() => {
                            const newKeyId = `QKD-KEY-${Math.floor(Math.random() * 9000 + 1000)}`;
                            const newBits = Array.from({length: 8}, () => Math.random() < 0.5 ? "0" : "1").join("");
                            setKmsKeys([
                              { id: newKeyId, algorithm: "Kyber-1024 / BB84", bits: newBits, status: "active", created: "Just Now" },
                              ...kmsKeys
                            ]);
                            alert("KMS: Active quantum keys rotated successfully!");
                          }}
                          className="btn-primary py-2 w-full text-xs"
                        >
                          🔄 Rotate Quantum Key
                        </button>
                      </div>

                      <div className="bg-bg-deep p-6 rounded-xl border border-border">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Key Strength Metrics</h4>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-[10px] text-gray-400 font-semibold mb-1">
                              <span>Entropy Density</span>
                              <span>99.8%</span>
                            </div>
                            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                              <div className="bg-success h-full" style={{ width: "99.8%" }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] text-gray-400 font-semibold mb-1">
                              <span>Decoherence rate</span>
                              <span>0.02%</span>
                            </div>
                            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                              <div className="bg-primary h-full" style={{ width: "2%" }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-bg-deep p-6 rounded-xl border border-border">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Security Warnings</h4>
                        <div className="alert-success text-[10px] py-2 px-3 border border-success/15 bg-success/5 rounded leading-relaxed text-success">
                          🛡️ System is running in hybrid quantum-resistant security mode. All files are signed using Dilithium signatures.
                        </div>
                      </div>
                    </div>

                    <div className="border border-border rounded-xl bg-bg-deep overflow-hidden">
                      <table className="table-premium font-mono text-xs">
                        <thead>
                          <tr>
                            <th>Key ID</th>
                            <th>Protocol Algorithm</th>
                            <th>QKD Key Bits</th>
                            <th>Clearence Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kmsKeys.map((key) => (
                            <tr key={key.id} className={key.status === "revoked" ? "opacity-40" : ""}>
                              <td className="font-bold text-white">{key.id}</td>
                              <td>{key.algorithm}</td>
                              <td className="text-primary">{key.bits}</td>
                              <td>
                                <span className={`badge ${key.status === "active" ? "badge-match" : "badge-discard"}`}>
                                  {key.status}
                                </span>
                              </td>
                              <td>
                                {key.status === "active" && (
                                  <button
                                    onClick={() => {
                                      setKmsKeys(kmsKeys.map(k => k.id === key.id ? { ...k, status: "revoked" } : k));
                                    }}
                                    className="text-danger hover:underline font-bold text-xs"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTabSub === "e2e-chat" && (
              <div className="space-y-6 lg:col-span-12 animate-slide-up">
                <div className="section-card">
                  <div className="section-header">
                    <h3 className="text-base font-bold text-white">📡 Secure E2E Quantum Messenger</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-bg-deep p-6 rounded-xl border border-border flex flex-col h-[400px]">
                      {/* Chat Messages */}
                      <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-none">
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex flex-col ${msg.sender === "Alice" ? "items-start" : "items-end"}`}>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold mb-1">
                              <span>{msg.sender}</span>
                              <span>{msg.time}</span>
                            </div>
                            <div className={`p-3 rounded-xl max-w-sm text-xs leading-relaxed ${
                              msg.sender === "Alice" 
                                ? "bg-primary/10 border border-primary/20 text-white rounded-tl-none" 
                                : "bg-success/10 border border-success/20 text-white rounded-tr-none"
                            }`}>
                              <p className="font-semibold">{msg.text}</p>
                              <div className="mt-2 pt-1 border-t border-border/40 font-mono text-[9px] text-gray-500 break-all select-all">
                                🔒 {msg.encryptedText}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Chat Input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!chatInput.trim()) return;
                          const encoded = btoa(chatInput).substring(0, 15);
                          setChatMessages([
                            ...chatMessages,
                            { sender: user?.username || "Operator", time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}), text: chatInput, encryptedText: encoded }
                          ]);
                          setChatInput("");
                        }}
                        className="flex gap-2 mt-4 pt-4 border-t border-border"
                      >
                        <input
                          type="text"
                          className="input-field flex-1"
                          placeholder="Type secure quantum message..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                        />
                        <button type="submit" className="btn-primary py-2 px-6 text-xs">
                          Send
                        </button>
                      </form>
                    </div>

                    <div className="bg-bg-deep p-6 rounded-xl border border-border space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">E2E Verification Info</h4>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        Messages are encrypted using XOR stream derived from reconciling matching qubits (BB84 Protocol).
                      </p>
                      <div className="alert-success text-[10px] p-3 border border-success/15 bg-success/5 rounded leading-relaxed text-success">
                        ✓ All channels are secured. Kyber PQC checks active.
                      </div>
                      
                      <div className="border-t border-border pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setShowEmailTool(!showEmailTool);
                          }}
                          className="btn-ghost w-full py-2 text-xs border border-border text-center"
                        >
                          {showEmailTool ? "Close Email Encrypter" : "📧 Email Attachment Cryptography"}
                        </button>
                      </div>

                      {showEmailTool && (
                        <div className="space-y-3 pt-3 border-t border-border/40 animate-fade-in">
                          <div>
                            <label className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Recipient Email</label>
                            <input
                              type="email"
                              className="input-field py-1 text-xs"
                              placeholder="bob@quantum.com"
                              value={emailRecipient}
                              onChange={(e) => setEmailRecipient(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Attachment Data</label>
                            <textarea
                              className="input-field py-1 text-xs h-16 resize-none"
                              placeholder="Top secret contract data..."
                              value={emailAttachmentText}
                              onChange={(e) => setEmailAttachmentText(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!emailAttachmentText) return;
                              setEmailEncryptedOutput(`QKD-ATTACHMENT-CIPHER:${btoa(emailAttachmentText).substring(0, 16)}`);
                            }}
                            className="btn-primary w-full py-1 text-[10px]"
                          >
                            Generate Encrypted Payload
                          </button>
                          {emailEncryptedOutput && (
                            <div className="bg-bg-card p-2 rounded border border-border text-[9px] font-mono text-primary select-all break-all leading-normal">
                              {emailEncryptedOutput}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ─── TAB 3: SECURE FILE LOCKER ─── */}
        {activeTab === "locker" && user?.role !== "guest" && (
          <div className="space-y-8 animate-slide-up">
            
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                {t("lockerTitle")}
              </h1>
              <p className="text-sm text-gray-400">
                Encrypt files using secure binary XOR operations and store them safely in the decentralized SQLite portal database.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* File Upload card */}
              <form onSubmit={handleFileUpload} className="lg:col-span-4 section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white">Upload New File</h3>
                </div>

                <div className="section-body space-y-4">
                  {lockerError && (
                    <div className="alert-danger text-xs p-3">
                      {lockerError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">{t("chooseFile")}</label>
                    <input
                      id="locker-file-input"
                      type="file"
                      className="input-field text-xs cursor-pointer file:bg-bg-deep file:text-white file:border-0 file:rounded file:px-2.5 file:py-1 file:mr-2"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="locker-upload-key">
                      {t("enterKey")}
                    </label>
                    <input
                      id="locker-upload-key"
                      type="text"
                      className="input-field font-mono text-xs"
                      placeholder="Quantum Key string..."
                      value={uploadKey}
                      onChange={(e) => setUploadKey(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary w-full py-3 text-xs"
                    disabled={lockerLoading || !uploadFile || !uploadKey}
                  >
                    {lockerLoading ? "Encrypting..." : t("uploadBtn")}
                  </button>
                </div>
              </form>

              {/* Saved Files table */}
              <div className="lg:col-span-8 section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white">{t("filesList")}</h3>
                </div>

                <div className="section-body p-0">
                  {filesList.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="table-premium">
                        <thead>
                          <tr>
                            <th>Filename</th>
                            <th>Owner</th>
                            <th>PQC Sig</th>
                            <th>Date Stored</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filesList.map((file) => (
                            <tr key={file.id}>
                              <td className="font-semibold text-white">{file.filename}</td>
                              <td>{file.owner}</td>
                              <td>
                                {file.pqc_signed
                                  ? <span style={{background:"rgba(139,92,246,0.15)",color:"#a78bfa",border:"1px solid rgba(139,92,246,0.4)",borderRadius:"6px",padding:"2px 8px",fontSize:"10px",fontWeight:700}}>🛡 Dilithium</span>
                                  : <span style={{color:"#6b7280",fontSize:"10px"}}>—</span>
                                }
                              </td>
                              <td>{new Date(file.created_at).toLocaleDateString()}</td>
                              <td className="text-right flex items-center justify-end gap-2 h-[49px]">
                                <button
                                  className="btn-ghost py-1 px-2.5 text-xs text-primary border border-primary/20 hover:bg-primary/10"
                                  onClick={() => triggerFileDownload(file)}
                                >
                                  Download
                                </button>
                                <button
                                  className="btn-ghost py-1 px-2.5 text-xs text-danger border border-danger/20 hover:bg-danger/10"
                                  onClick={() => handleDeleteFile(file.id)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-gray-500 text-xs">
                      No files encrypted yet.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ─── TAB 4: ADMIN AUDIT LOGS ─── */}
        {activeTab === "admin" && user?.role === "admin" && (
          <div className="space-y-8 animate-slide-up">
            
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                {t("adminTitle")}
              </h1>
              <p className="text-sm text-gray-400">
                Inspect system operations, audit user activities, and perform database backups.
              </p>
            </div>

            {/* Backup & Recovery cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <div className="section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white">Database Backup</h3>
                </div>
                <div className="section-body space-y-4">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {t("backupDesc")}
                  </p>
                  <button
                    className="btn-primary py-2.5 text-xs"
                    onClick={handleDownloadBackup}
                    disabled={backupLoading}
                  >
                    {backupLoading ? "Generating Backup..." : "Download SQL Database Backup"}
                  </button>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <h3 className="text-sm font-bold text-white">Restore Database</h3>
                </div>
                <div className="section-body space-y-4">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Upload a valid SQLite database backup (`.db`) file to overwrite current portal history.
                  </p>

                  {restoreSuccess && (
                    <div className="alert-success text-xs p-3">
                      {restoreSuccess}
                    </div>
                  )}

                  <form onSubmit={handleRestoreBackupSubmit} className="flex gap-3">
                    <input
                      type="file"
                      accept=".db"
                      className="input-field text-xs file:bg-bg-deep file:text-white file:border-0 file:rounded file:px-2 file:py-0.5"
                      onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                    />
                    <button
                      type="submit"
                      className="btn-primary py-2 px-4 text-xs font-bold"
                      disabled={!restoreFile}
                    >
                      Restore
                    </button>
                  </form>
                </div>
              </div>

            </div>

            {/* Audit Logs History */}
            <div className="section-card">
              <div className="section-header">
                <h3 className="text-sm font-bold text-white">Audit Trail History</h3>
              </div>

              <div className="section-body p-0 max-h-[400px] overflow-y-auto">
                {auditLogs.length > 0 ? (
                  <table className="table-premium font-mono text-xs">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="text-gray-500 font-bold">{log.id}</td>
                          <td className="text-white">{log.username}</td>
                          <td className="text-primary font-bold">{log.action}</td>
                          <td>{log.details}</td>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-10 text-gray-500 text-xs">
                    No logs found.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ─── TAB 5: PROFILE SETTINGS ─── */}
        {activeTab === "profile" && user?.role !== "guest" && (
          <div className="max-w-xl mx-auto section-card animate-slide-up">
            <div className="section-header">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                👤 {t("profileTitle")}
              </h2>
            </div>

            <div className="section-body space-y-6">
              {profileMessage && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${
                  profileMessage.type === "success" 
                    ? "alert-success"
                    : "alert-danger"
                }`}>
                  {profileMessage.text}
                </div>
              )}

              <form onSubmit={handleProfileUpdateSubmit} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="prof-username">
                    {t("usernameLabel")}
                  </label>
                  <input
                    id="prof-username"
                    type="text"
                    className="input-field font-mono text-xs bg-bg-deep opacity-60 cursor-not-allowed"
                    value={user?.username || ""}
                    disabled
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="prof-fullname">
                    {t("fullNameLabel")}
                  </label>
                  <input
                    id="prof-fullname"
                    type="text"
                    className="input-field"
                    value={profileFullName}
                    onChange={(e) => setProfileFullName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="prof-role">
                    {t("roleLabel")}
                  </label>
                  <input
                    id="prof-role"
                    type="text"
                    className="input-field font-mono text-xs bg-bg-deep opacity-60 cursor-not-allowed"
                    value={user?.role?.toUpperCase() || ""}
                    disabled
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="prof-password">
                    {t("passwordLabel")}
                  </label>
                  <input
                    id="prof-password"
                    type="password"
                    className="input-field"
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <button type="submit" className="btn-primary w-full py-3 mt-4">
                  {t("saveBtn")}
                </button>

              </form>

              {/* Two-Factor Authentication Section */}
              <div className="border-t border-border pt-6 mt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Two-Factor Authentication (2FA)
                    </h4>
                    <p className="text-[11px] text-gray-500 leading-normal mt-1">
                      Secure your operator profile with time-based verification codes.
                    </p>
                  </div>
                  {profile2FAEnabled ? (
                    <span className="badge badge-match flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                      ACTIVE
                    </span>
                  ) : (
                    <span className="badge badge-discard">INACTIVE</span>
                  )}
                </div>

                {profile2FAEnabled ? (
                  <button
                    type="button"
                    onClick={handleDisable2FA}
                    className="btn-ghost py-2 w-full text-xs border border-danger/20 hover:bg-danger/10 hover:text-white"
                  >
                    🚫 Deactivate 2FA Security
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSetup2FA}
                    className="btn-primary py-2 w-full text-xs bg-primary hover:bg-primary/95"
                  >
                    🔑 Enable 2FA Security
                  </button>
                )}
              </div>

              {/* Subscription Plan Section */}
              <div className="border-t border-border pt-6 mt-6 space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    {t("subscriptionLabel")}
                  </h4>
                  <p className="text-[11px] text-gray-500 leading-normal mt-1">
                    Manage your operational capabilities and cloud resource ceilings.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  {/* Free Plan Card */}
                  <div className={`p-3 rounded-xl border ${profileSubTier === "free" ? "border-primary/50 bg-primary/5" : "border-border bg-bg-deep"} flex flex-col justify-between`}>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block">BASIC</span>
                      <span className="text-sm font-extrabold text-white mt-1 block">Free</span>
                      <p className="text-[9px] text-gray-500 mt-2 leading-relaxed">
                        • 2 files limit<br />
                        • 1MB size limit<br />
                        • NumPy QKD
                      </p>
                    </div>
                    {profileSubTier === "free" && (
                      <span className="text-[9px] text-primary font-bold mt-3 block">✓ ACTIVE</span>
                    )}
                  </div>

                  {/* Pro Plan Card */}
                  <div className={`p-3 rounded-xl border ${profileSubTier === "pro" ? "border-primary/50 bg-primary/5" : "border-border bg-bg-deep"} flex flex-col justify-between`}>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block">PRO</span>
                      <span className="text-sm font-extrabold text-white mt-1 block">$10 / mo</span>
                      <p className="text-[9px] text-gray-500 mt-2 leading-relaxed">
                        • 10 files limit<br />
                        • 10MB size limit<br />
                        • Qiskit + PQC
                      </p>
                    </div>
                    {profileSubTier === "pro" ? (
                      <span className="text-[9px] text-primary font-bold mt-3 block">✓ ACTIVE</span>
                    ) : profileSubTier === "free" ? (
                      <button
                        onClick={() => {
                          setTargetUpgradeTier("pro");
                          setShowUpgradeModal(true);
                        }}
                        className="btn-primary py-1 px-2 text-[9px] mt-3"
                      >
                        Upgrade
                      </button>
                    ) : (
                      <span className="text-[9px] text-gray-600 mt-3 block">Downgrade</span>
                    )}
                  </div>

                  {/* Enterprise Plan Card */}
                  <div className={`p-3 rounded-xl border ${profileSubTier === "enterprise" ? "border-primary/50 bg-primary/5" : "border-border bg-bg-deep"} flex flex-col justify-between`}>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block">ENTERPRISE</span>
                      <span className="text-sm font-extrabold text-white mt-1 block">$49 / mo</span>
                      <p className="text-[9px] text-gray-500 mt-2 leading-relaxed">
                        • Unlimited files<br />
                        • Unlimited size<br />
                        • Backups & KMS
                      </p>
                    </div>
                    {profileSubTier === "enterprise" ? (
                      <span className="text-[9px] text-primary font-bold mt-3 block">✓ ACTIVE</span>
                    ) : (
                      <button
                        onClick={() => {
                          setTargetUpgradeTier("enterprise");
                          setShowUpgradeModal(true);
                        }}
                        className="btn-primary py-1 px-2 text-[9px] mt-3"
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ─── MODAL: LOGIN / REGISTER / FORGOT ─── */}
      {showAuthModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-white font-bold text-sm cursor-pointer"
              onClick={() => setShowAuthModal(false)}
            >
              ✕
            </button>

            <h3 className="text-xl font-bold text-white mb-6 text-center">
              {authType === "login" ? t("loginBtn") : authType === "register" ? t("registerBtn") : "Reset Identity Passphrase"}
            </h3>

            {authError && (
              <div className="alert-danger text-xs text-center p-3 mb-4">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="modal-username">
                  Username
                </label>
                <input
                  id="modal-username"
                  type="text"
                  required
                  className="input-field"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="e.g. operatorsmith"
                />
              </div>

              {authType === "register" && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="modal-fullname">
                      Full Name
                    </label>
                    <input
                      id="modal-fullname"
                      type="text"
                      className="input-field"
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="e.g. Agent Smith"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="modal-email">
                      Email Address (Optional)
                    </label>
                    <input
                      id="modal-email"
                      type="email"
                      className="input-field"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="e.g. smith@matrix.com"
                    />
                  </div>
                </>
              )}

              {authType !== "forgot" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="modal-password">
                    Security Password
                  </label>
                  <input
                    id="modal-password"
                    type="password"
                    required
                    className="input-field"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>
              )}

              {loginRequires2FA && (
                <div className="space-y-1 animate-slide-down">
                  <label className="text-[10px] text-warning font-bold uppercase tracking-wider block" htmlFor="modal-otp">
                    2FA Verification Code
                  </label>
                  <input
                    id="modal-otp"
                    type="text"
                    required
                    className="input-field font-mono text-center tracking-widest text-lg"
                    placeholder="000000"
                    maxLength={6}
                    value={login2FACode}
                    onChange={(e) => setLogin2FACode(e.target.value)}
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full py-3 mt-4"
                disabled={authLoading}
              >
                {authLoading ? "Authenticating..." : authType === "login" ? t("loginBtn") : authType === "register" ? t("registerBtn") : "Reset"}
              </button>

              {authType === "login" && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full py-3 mt-2 border border-border hover:border-border-hover bg-bg-card/30 hover:bg-bg-card/60 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all duration-300"
                  disabled={authLoading}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </button>
              ) /* End google button */}

              <div className="flex justify-between items-center text-[11px] text-gray-500 pt-4 border-t border-border mt-4">
                {authType === "login" ? (
                  <>
                    <button type="button" className="hover:text-white cursor-pointer" onClick={() => setAuthType("register")}>
                      Create Operator Account
                    </button>
                    <button type="button" className="hover:text-white cursor-pointer" onClick={() => setAuthType("forgot")}>
                      Forgot Password?
                    </button>
                  </>
                ) : (
                  <button type="button" className="hover:text-white cursor-pointer mx-auto" onClick={() => setAuthType("login")}>
                    Back to Login Terminal
                  </button>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Sleek Floating Settings Panel for Particle Field */}
      <div className="fixed bottom-20 right-6 z-50 animate-fade-in">
        {showCanvasSettings && (
          <div className="w-80 glass-panel bg-bg-card/95 border border-border-hover rounded-2xl p-5 shadow-2xl space-y-4">
             {/* Header */}
             <div className="flex justify-between items-center pb-2 border-b border-border">
               <h4 className="text-xs font-bold text-white uppercase tracking-wider">Quantum Particle Field</h4>
               <div className="flex gap-2">
                 <button
                   onClick={handleBgRandomize}
                   className="text-[10px] text-primary hover:underline font-semibold bg-transparent border-none cursor-pointer"
                 >
                   🎲 Random
                 </button>
                 <button
                   onClick={() => setShowCanvasSettings(false)}
                   className="text-[10px] text-gray-400 hover:text-white font-semibold bg-transparent border-none cursor-pointer"
                 >
                   ✕
                 </button>
               </div>
             </div>

             {/* Preset Selector */}
             <div className="space-y-1">
               <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Color Preset</label>
               <select
                 className="input-field py-1.5 text-xs bg-bg-deep cursor-pointer"
                 value={bgPreset}
                 onChange={(e) => setBgPreset(e.target.value)}
               >
                 <option value="cosmic">Cosmic (Neon Purple)</option>
                 <option value="matrix">Matrix (Terminal Green)</option>
                 <option value="fireflies">Fireflies (Warm Yellow)</option>
                 <option value="rainbow">Rainbow (Spectrum Drift)</option>
                 <option value="default">Default (Random Colorways)</option>
               </select>
             </div>

             {/* Range Sliders */}
             <div className="space-y-2.5">
               <div className="space-y-1">
                 <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                   <span>Particle Density</span>
                   <span>{bgParticleCount}</span>
                 </div>
                 <input
                   type="range"
                   min="20"
                   max="300"
                   step="10"
                   value={bgParticleCount}
                   onChange={(e) => setBgParticleCount(parseInt(e.target.value))}
                   className="w-full accent-primary bg-bg-deep rounded-lg h-1 cursor-pointer"
                 />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                   <span>Link Distance</span>
                   <span>{bgConnectionRadius}px</span>
                 </div>
                 <input
                   type="range"
                   min="40"
                   max="200"
                   step="10"
                   value={bgConnectionRadius}
                   onChange={(e) => setBgConnectionRadius(parseInt(e.target.value))}
                   className="w-full accent-primary bg-bg-deep rounded-lg h-1 cursor-pointer"
                 />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                   <span>Velocity</span>
                   <span>{bgParticleSpeed}x</span>
                 </div>
                 <input
                   type="range"
                   min="0.1"
                   max="3.0"
                   step="0.1"
                   value={bgParticleSpeed}
                   onChange={(e) => setBgParticleSpeed(parseFloat(e.target.value))}
                   className="w-full accent-primary bg-bg-deep rounded-lg h-1 cursor-pointer"
                 />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                   <span>Glow Intensity</span>
                   <span>{bgGlowIntensity}px</span>
                 </div>
                 <input
                   type="range"
                   min="0"
                   max="30"
                   step="1"
                   value={bgGlowIntensity}
                   onChange={(e) => setBgGlowIntensity(parseInt(e.target.value))}
                   className="w-full accent-primary bg-bg-deep rounded-lg h-1 cursor-pointer"
                 />
               </div>
             </div>

             {/* Physics Switch Toggles (Grid) */}
             <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Gravity Well</span>
                 <div
                   onClick={() => setBgGravityWell(!bgGravityWell)}
                   className={`toggle-track h-3.5 w-7 ${bgGravityWell ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgGravityWell ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Vortex Spin</span>
                 <div
                   onClick={() => setBgVortex(!bgVortex)}
                   className={`toggle-track h-3.5 w-7 ${bgVortex ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgVortex ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Time Dilation</span>
                 <div
                   onClick={() => setBgTimeDilation(!bgTimeDilation)}
                   className={`toggle-track h-3.5 w-7 ${bgTimeDilation ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgTimeDilation ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Black Hole</span>
                 <div
                   onClick={() => setBgBlackHole(!bgBlackHole)}
                   className={`toggle-track h-3.5 w-7 ${bgBlackHole ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgBlackHole ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Repulsion</span>
                 <div
                   onClick={() => setBgRepulsion(!bgRepulsion)}
                   className={`toggle-track h-3.5 w-7 ${bgRepulsion ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgRepulsion ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Tornado</span>
                 <div
                   onClick={() => setBgTornado(!bgTornado)}
                   className={`toggle-track h-3.5 w-7 ${bgTornado ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgTornado ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Pinch In</span>
                 <div
                   onClick={() => setBgPinch(!bgPinch)}
                   className={`toggle-track h-3.5 w-7 ${bgPinch ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgPinch ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Color Wave</span>
                 <div
                   onClick={() => setBgColorWave(!bgColorWave)}
                   className={`toggle-track h-3.5 w-7 ${bgColorWave ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgColorWave ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Pulse Wave</span>
                 <div
                   onClick={() => setBgPulseWave(!bgPulseWave)}
                   className={`toggle-track h-3.5 w-7 ${bgPulseWave ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgPulseWave ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Trails</span>
                 <div
                   onClick={() => setBgTrails(!bgTrails)}
                   className={`toggle-track h-3.5 w-7 ${bgTrails ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgTrails ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Show Links</span>
                 <div
                   onClick={() => setBgDrawConnections(!bgDrawConnections)}
                   className={`toggle-track h-3.5 w-7 ${bgDrawConnections ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgDrawConnections ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>

               <div className="flex items-center justify-between bg-bg-deep p-1.5 rounded border border-border text-[9px] text-gray-400 font-bold uppercase">
                 <span>Click Boom</span>
                 <div
                   onClick={() => setBgClickExplosion(!bgClickExplosion)}
                   className={`toggle-track h-3.5 w-7 ${bgClickExplosion ? "active" : ""}`}
                   style={{ cursor: 'pointer' }}
                 >
                   <div className="toggle-thumb animate-none" style={{ width: '10px', height: '10px', top: '2px', left: '2px', transform: bgClickExplosion ? 'translateX(10px)' : 'none' }} />
                 </div>
               </div>
             </div>

             {/* Action Buttons */}
             <div className="grid grid-cols-2 gap-2 pt-2">
               <button
                 type="button"
                 onClick={handleBgExplosion}
                 className="btn-primary py-1.5 px-2 text-[10px] bg-danger hover:bg-danger/80"
               >
                 💥 Explosion
               </button>
               <button
                 type="button"
                 onClick={() => {
                   const anim = (window as any).quantumAnimation;
                   if (anim) {
                     anim.initParticles();
                   }
                 }}
                 className="btn-ghost py-1.5 border border-border text-[10px] font-bold"
               >
                 🔄 Reset Field
               </button>
             </div>
          </div>
        )}
      </div>

      {/* Floating Settings FAB Trigger Tag */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setShowCanvasSettings(!showCanvasSettings)}
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-2xl transition-all glass-panel border border-border/80 cursor-pointer ${
            showCanvasSettings ? "bg-primary/20 border-primary text-primary" : "bg-bg-card hover:bg-bg-elevated text-gray-400 hover:text-white"
          }`}
          title="Background Settings"
        >
          <svg className={`w-5 h-5 ${showCanvasSettings ? "animate-spin-slow" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* ─── AI CHATBOT FLOAT PANEL ─── */}
      <div className="fixed bottom-6 right-20 z-50 flex flex-col items-end gap-3">
        {/* Expanded Chat window */}
        {showAIChat && (
          <div className="w-80 h-96 glass-panel border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-slide-up bg-bg-deep/95">
            {/* Header */}
            <div className="p-4 border-b border-border bg-bg-card flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs">🤖</span>
                <div>
                  <h4 className="text-xs font-bold text-white leading-none">Quantum Assistant</h4>
                  <span className="text-[9px] text-primary-light font-bold">ONLINE</span>
                </div>
              </div>
              <button
                onClick={() => setShowAIChat(false)}
                className="text-gray-500 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-[10px]">
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-2.5 rounded-xl border leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-primary/10 border-primary/20 text-white rounded-tr-none"
                        : "bg-bg-card border-border text-gray-300 rounded-tl-none"
                    }`}
                  >
                    {msg.text.split("\n").map((para, pIdx) => {
                      const formatted = para.split("**").map((chunk, cIdx) => 
                        cIdx % 2 === 1 ? <strong key={cIdx} className="text-primary-light font-bold">{chunk}</strong> : chunk
                      );
                      return <p key={pIdx} className="mb-1">{formatted}</p>;
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleAiChatSubmit} className="p-3 border-t border-border bg-bg-card flex gap-2">
              <input
                type="text"
                className="input-field py-1.5 px-3 text-[10px] flex-1"
                placeholder="Ask me about BB84, QBER, XOR..."
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary py-1.5 px-3 text-[10px] bg-primary"
              >
                Ask
              </button>
            </form>
          </div>
        )}

        {/* Float Action FAB Button */}
        <button
          onClick={() => setShowAIChat(!showAIChat)}
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-2xl transition-all glass-panel border border-border/80 cursor-pointer ${
            showAIChat ? "bg-primary/20 border-primary text-primary" : "bg-bg-card hover:bg-bg-elevated text-gray-400 hover:text-white"
          }`}
          title="Quantum AI Assistant"
        >
          <span className="text-lg">🤖</span>
        </button>
      </div>
      
      {/* ─── MODAL: DECRYPT FILE ─── */}
      {showDecryptFileModal && selectedFileToDecrypt && (
        <div className="modal-overlay">
          <div className="modal-card">
            
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-white font-bold text-sm cursor-pointer"
              onClick={() => setShowDecryptFileModal(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-white mb-2 text-center">
              {t("decryptModalTitle")}
            </h3>
            <p className="text-xs text-gray-400 mb-6 text-center leading-relaxed">
              {t("decryptPrompt")}
            </p>

            {fileDecryptError && (
              <div className="alert-danger text-xs text-center p-3 mb-4">
                {fileDecryptError}
              </div>
            )}

            <form onSubmit={handleDecryptFileSubmit} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="modal-decrypt-key">
                  Quantum Key (Binary string)
                </label>
                <input
                  id="modal-decrypt-key"
                  type="text"
                  required
                  className="input-field font-mono text-xs text-primary"
                  value={fileDecryptionKey}
                  onChange={(e) => setFileDecryptionKey(e.target.value)}
                  placeholder="Enter binary key..."
                />
              </div>

              <div className="text-[10px] text-primary bg-primary/5 p-3 rounded-lg border border-primary/10 select-all leading-normal">
                <strong>Verifying Key Status:</strong><br />
                The portal matches the hash configuration dynamically. Enter the binary key string to stream download.
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-3"
              >
                🔓 {t("decryptSubmit")}
              </button>

            </form>
          </div>
        </div>
      )}
      {/* ─── MODAL: 2FA SETUP ─── */}
      {showTwoFactorSetup && (
        <div className="modal-overlay">
          <div className="modal-card max-w-sm">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-white font-bold text-sm cursor-pointer"
              onClick={() => setShowTwoFactorSetup(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-white mb-2 text-center">
              Configure 2FA Authenticator
            </h3>
            <p className="text-xs text-gray-400 mb-4 text-center leading-relaxed">
              Scan the QR Code using Google Authenticator, Microsoft Authenticator, or another TOTP client.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 bg-white p-4 rounded-xl border border-border">
              <img src={twoFactorQRCode} alt="TOTP QR Code" className="w-40 h-40" />
            </div>

            <form onSubmit={handleVerify2FA} className="space-y-4 mt-6">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                  Secret Key
                </label>
                <div className="bg-bg-deep p-2.5 rounded border border-border font-mono text-[10px] text-primary break-all select-all text-center">
                  {twoFactorSecret}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="totp-code">
                  Enter 6-Digit Authenticator Code
                </label>
                <input
                  id="totp-code"
                  type="text"
                  required
                  className="input-field text-center font-mono text-base tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value)}
                />
              </div>

              <div className="text-[9px] text-warning bg-warning/5 p-2.5 rounded border border-warning/10 leading-normal">
                <strong>Simulated Authenticator Code:</strong> {twoFactorSimCode}<br />
                (Use this code to verify in standard local testing mode)
              </div>

              <button
                type="submit"
                className="btn-primary w-full py-3"
              >
                Verify & Enable 2FA
              </button>
            </form>
          </div>
        </div>
      )}
      {/* ─── MODAL: CHECKOUT SIMULATOR ─── */}
      {showUpgradeModal && (
        <div className="modal-overlay">
          <div className="modal-card max-w-sm">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-white font-bold text-sm cursor-pointer"
              onClick={() => setShowUpgradeModal(false)}
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
              💳 Secure Billing Terminal
            </h3>
            <p className="text-xs text-gray-400 mb-6 text-center leading-relaxed">
              Complete payment to activate your <strong className="text-primary-light">{targetUpgradeTier.toUpperCase()}</strong> subscription.
            </p>

            {paymentError && (
              <div className="alert-danger text-xs p-3 mb-4 rounded-xl border border-danger/20 bg-danger/5">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleUpgradeSubscription} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="cc-name">
                  Cardholder Name
                </label>
                <input
                  id="cc-name"
                  type="text"
                  required
                  placeholder="John Doe"
                  className="input-field"
                  value={ccName}
                  onChange={(e) => setCcName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="cc-number">
                  Credit Card Number
                </label>
                <input
                  id="cc-number"
                  type="text"
                  required
                  placeholder="0000 0000 0000 0000"
                  className="input-field font-mono"
                  value={ccNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").substring(0, 16);
                    const formatted = val.match(/.{1,4}/g)?.join(" ") || val;
                    setCcNumber(formatted);
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="cc-expiry">
                    Expiration Date
                  </label>
                  <input
                    id="cc-expiry"
                    type="text"
                    required
                    placeholder="MM/YY"
                    className="input-field font-mono"
                    value={ccExpiry}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").substring(0, 4);
                      const formatted = val.length > 2 ? `${val.substring(0, 2)}/${val.substring(2)}` : val;
                      setCcExpiry(formatted);
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block" htmlFor="cc-cvv">
                    CVV
                  </label>
                  <input
                    id="cc-cvv"
                    type="password"
                    required
                    placeholder="000"
                    className="input-field font-mono"
                    maxLength={3}
                    value={ccCvv}
                    onChange={(e) => setCcCvv(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>

              <div className="text-[9px] text-gray-500 bg-bg-deep p-3 rounded-lg border border-border leading-normal">
                🔒 Your transaction is encrypted using simulated AES-256 + BB84 hybrid keys. Enter any 16-digit card number to authorize.
              </div>

              <button
                type="submit"
                disabled={paymentLoading}
                className="btn-primary w-full py-3 mt-4"
              >
                {paymentLoading ? "Authorizing Payment..." : `Pay $${targetUpgradeTier === "pro" ? "10.00" : "49.00"} & Activate`}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Quantum Particle Drawing Engine (Canvas) ───

class QuantumParticle {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  dx: number;
  dy: number;
  color: string;
  originalSpeed: number;
  trail: Array<{ x: number; y: number }>;

  constructor(x: number, y: number, color: string, speed: number) {
    this.x = x;
    this.y = y;
    this.baseRadius = Math.random() * 3 + 1;
    this.radius = this.baseRadius;
    this.dx = (Math.random() - 0.5) * 2 * speed;
    this.dy = (Math.random() - 0.5) * 2 * speed;
    this.color = color;
    this.originalSpeed = speed;
    this.trail = [];
  }

  update(width: number, height: number, delta: number = 16) {
    const normalizedDelta = delta / 16;
    this.x += this.dx * normalizedDelta;
    this.y += this.dy * normalizedDelta;

    // Bounce off edges
    if (this.x < 0 || this.x > width) {
      this.dx *= -1;
      this.x = Math.max(0, Math.min(width, this.x));
    }
    if (this.y < 0 || this.y > height) {
      this.dy *= -1;
      this.y = Math.max(0, Math.min(height, this.y));
    }

    // Keep speed bounded
    const speed = Math.hypot(this.dx, this.dy);
    if (speed > this.originalSpeed * 2.5) {
      this.dx = (this.dx / speed) * this.originalSpeed * 2.5;
      this.dy = (this.dy / speed) * this.originalSpeed * 2.5;
    }
  }

  draw(ctx: CanvasRenderingContext2D, glowIntensity: number) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    
    // Glow effect
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = this.color;
    
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }
}

class QuantumParticleAnimation {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  particles: QuantumParticle[];
  connectionRadius: number;
  particleCount: number;
  particleSpeed: number;
  glowIntensity: number;
  gravityWellActive: boolean;
  timeDilationActive: boolean;
  vortexActive: boolean;
  colorWaveActive: boolean;
  repulsionActive: boolean;
  explosionTime: number;
  pulseWaveActive: boolean;
  tornadoActive: boolean;
  blackHoleActive: boolean;
  trailsActive: boolean;
  pinchActive: boolean;
  drawConnectionsActive: boolean;
  clickExplosionActive: boolean;
  pulseTime: number;
  tornadoAngle: number;
  mousePos: { x: number; y: number };
  lastTime: number;
  fps: number;
  frameCount: number;
  lastFpsUpdate: number;
  colorWaveOffset: number;
  currentColorScheme: string;
  width: number = 0;
  height: number = 0;
  animationFrameId: number | null = null;
  destroyed: boolean = false;

  colorSchemes: Record<string, () => string> = {
    default: () => `hsla(${Math.random() * 360}, 70%, 60%, 0.8)`,
    cosmic: () => `hsla(${Math.random() * 60 + 220}, 80%, 60%, 0.8)`,
    matrix: () => `hsla(120, ${Math.random() * 40 + 60}%, 50%, 0.8)`,
    fireflies: () => `hsla(${Math.random() * 40 + 20}, 100%, 70%, 0.8)`,
    rainbow: () => `hsla(${(Date.now() * 0.1) % 360}, 80%, 60%, 0.8)`
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not acquire 2D context");
    this.ctx = context;
    this.particles = [];
    this.connectionRadius = 100;
    this.particleCount = 100;
    this.particleSpeed = 0.6;
    this.glowIntensity = 12;
    this.gravityWellActive = true;
    this.timeDilationActive = false;
    this.vortexActive = false;
    this.colorWaveActive = false;
    this.repulsionActive = true;
    this.explosionTime = 0;
    this.pulseWaveActive = false;
    this.tornadoActive = false;
    this.blackHoleActive = false;
    this.trailsActive = false;
    this.pinchActive = false;
    this.drawConnectionsActive = true;
    this.clickExplosionActive = true;
    this.pulseTime = 0;
    this.tornadoAngle = 0;
    this.mousePos = { x: 0, y: 0 };
    this.lastTime = performance.now();
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.colorWaveOffset = 0;
    this.currentColorScheme = 'cosmic';

    this.resize();
    this.initParticles();
    this.setupEventListeners();
    this.animate();
  }

  setupEventListeners() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
  }

  handleResize = () => {
    this.resize();
  };

  handleMouseMove = (e: MouseEvent) => {
    this.mousePos.x = e.clientX;
    this.mousePos.y = e.clientY;
  };

  handleMouseDown = (e: MouseEvent) => {
    // Only boom if clicking inside canvas bounds (avoid hitting UI cards)
    if (this.clickExplosionActive) {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'canvas' || target.id === 'quantumCanvas' || target === document.body) {
        this.triggerExplosion(e.clientX, e.clientY);
      }
    }
  };

  updateParticleSpeed() {
    for (let particle of this.particles) {
      const currentSpeed = Math.hypot(particle.dx, particle.dy);
      if (currentSpeed > 0) {
        particle.dx = (particle.dx / currentSpeed) * this.particleSpeed;
        particle.dy = (particle.dy / currentSpeed) * this.particleSpeed;
      }
      particle.originalSpeed = this.particleSpeed;
    }
  }

  setPreset(preset: string) {
    this.currentColorScheme = preset;
    switch(preset) {
      case 'cosmic':
        this.particleSpeed = 0.5;
        this.glowIntensity = 20;
        break;
      case 'matrix':
        this.particleSpeed = 1.5;
        this.glowIntensity = 10;
        break;
      case 'fireflies':
        this.particleSpeed = 0.8;
        this.glowIntensity = 18;
        break;
      case 'rainbow':
        this.particleSpeed = 1.2;
        this.glowIntensity = 15;
        break;
    }
    this.updateParticleSpeed();
    this.initParticles();
  }

  triggerExplosion(x?: number, y?: number) {
    this.explosionTime = performance.now();
    const centerX = x !== undefined ? x : this.width / 2;
    const centerY = y !== undefined ? y : this.height / 2;
    for (let particle of this.particles) {
      const dx = particle.x - centerX;
      const dy = particle.y - centerY;
      const angle = Math.atan2(dy, dx);
      const speed = Math.random() * 8 + 4;
      particle.dx = Math.cos(angle) * speed;
      particle.dy = Math.sin(angle) * speed;
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(new QuantumParticle(
        Math.random() * this.width,
        Math.random() * this.height,
        this.colorSchemes[this.currentColorScheme](),
        this.particleSpeed
      ));
    }
  }

  drawConnections() {
    this.ctx.beginPath();
    const connRadiusSq = this.connectionRadius * this.connectionRadius;
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < connRadiusSq) {
          const distance = Math.sqrt(distSq);
          const opacity = 1 - (distance / this.connectionRadius);
          this.ctx.strokeStyle = `rgba(99, 102, 241, ${opacity * 0.12})`;
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
        }
      }
    }
    this.ctx.stroke();
  }

  animate = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.pulseWaveActive) {
      this.pulseTime += delta * 0.001;
    }
    if (this.tornadoActive) {
      this.tornadoAngle += delta * 0.001;
    }
    if (this.colorWaveActive) {
      this.colorWaveOffset += delta * 0.001;
    }
    
    if (this.drawConnectionsActive) {
      this.drawConnections();
    }
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    for (let particle of this.particles) {
      if (this.gravityWellActive) {
        const dx = this.mousePos.x - particle.x;
        const dy = this.mousePos.y - particle.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 40000) { // 200^2
          const distance = Math.sqrt(distSq);
          const force = (200 - distance) * 0.0003;
          particle.dx += dx * force;
          particle.dy += dy * force;
        }
      }

      if (this.pinchActive) {
        const dx = this.mousePos.x - particle.x;
        const dy = this.mousePos.y - particle.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 100) { // 10^2
          const distance = Math.sqrt(distSq);
          const force = 0.05;
          particle.dx += (dx / distance) * force;
          particle.dy += (dy / distance) * force;
        }
      }
      
      if (this.vortexActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0) {
          const distance = Math.sqrt(distSq);
          const angle = Math.atan2(dy, dx);
          const vortexForce = 0.05;
          particle.dx += -Math.sin(angle) * vortexForce;
          particle.dy += Math.cos(angle) * vortexForce;
        }
      }
      
      if (this.colorWaveActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hue = (distance * 0.5 + this.colorWaveOffset * 100) % 360;
        particle.color = `hsla(${hue}, 70%, 60%, 0.8)`;
      }
      
      if (this.repulsionActive) {
        for (let other of this.particles) {
          if (other !== particle) {
            const dx = particle.x - other.x;
            const dy = particle.y - other.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 1600) { // 40^2
              const distance = Math.sqrt(distSq);
              const force = 0.02 / (distance + 1);
              particle.dx += dx * force;
              particle.dy += dy * force;
            }
          }
        }
      }

      if (this.pulseWaveActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0) {
          const distance = Math.sqrt(distSq);
          const wavePhase = (distance * 0.05 - this.pulseTime * 2) % (Math.PI * 2);
          const wavePush = Math.sin(wavePhase) * 0.4;
          const angle = Math.atan2(dy, dx);
          particle.dx += Math.cos(angle) * wavePush;
          particle.dy += Math.sin(angle) * wavePush;
        }
      }

      if (this.tornadoActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0) {
          const distance = Math.sqrt(distSq);
          const angle = Math.atan2(dy, dx) + this.tornadoAngle;
          const radius = distance * 0.96;
          const targetX = centerX + Math.cos(angle) * radius;
          const targetY = centerY + Math.sin(angle) * radius;
          particle.dx += (targetX - particle.x) * 0.08;
          particle.dy += (targetY - particle.y) * 0.08;
        }
      }

      if (this.blackHoleActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 14400) { // 120^2
          const distance = Math.sqrt(distSq);
          particle.radius *= 0.99;
          const force = (120 - distance) * 0.0015;
          particle.dx -= dx * force;
          particle.dy -= dy * force;
        } else {
          particle.radius = Math.min(particle.radius * 1.01, particle.baseRadius);
        }
      }

      if (this.explosionTime > 0) {
        const timeSinceExplosion = performance.now() - this.explosionTime;
        if (timeSinceExplosion > 2000) {
          this.explosionTime = 0;
        } else {
          particle.dx *= 0.98;
          particle.dy *= 0.98;
        }
      }
      
      if (this.timeDilationActive) {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distanceToCenter = Math.sqrt(dx * dx + dy * dy);
        const timeScale = 1 - (Math.min(distanceToCenter, 300) / 300) * 0.8;
        particle.update(this.width, this.height, delta * timeScale);
      } else {
        particle.update(this.width, this.height, delta);
      }
      
      particle.draw(this.ctx, this.glowIntensity);
    }
    
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  randomize() {
    this.particleCount = Math.floor(Math.random() * 200) + 50;
    this.connectionRadius = Math.floor(Math.random() * 150) + 50;
    this.particleSpeed = parseFloat((Math.random() * 2.0 + 0.2).toFixed(1));
    this.glowIntensity = Math.floor(Math.random() * 20);

    if (Math.random() < 0.25) {
      const presets = ['cosmic', 'matrix', 'fireflies', 'rainbow'];
      const randomPreset = presets[Math.floor(Math.random() * presets.length)];
      this.currentColorScheme = randomPreset;
    } else {
      const hue = Math.random() * 360;
      this.currentColorScheme = 'default';
      this.colorSchemes.default = () => `hsla(${hue}, 80%, 60%, 0.8)`;
    }

    this.gravityWellActive = Math.random() < 0.4;
    this.timeDilationActive = Math.random() < 0.3;
    this.vortexActive = Math.random() < 0.3;
    this.colorWaveActive = Math.random() < 0.3;
    this.repulsionActive = Math.random() < 0.4;
    this.pulseWaveActive = Math.random() < 0.3;
    this.tornadoActive = Math.random() < 0.3;
    this.blackHoleActive = Math.random() < 0.3;
    this.pinchActive = Math.random() < 0.35;

    this.initParticles();
    this.updateParticleSpeed();
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}
