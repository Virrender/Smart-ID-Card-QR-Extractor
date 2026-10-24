// components/ResultCard.js
import React, { useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Share,
  Modal,
  TextInput,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import {
  Share2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Camera,
  Image as ImageIcon,
  User,
  RotateCcw,
  Phone,
  ShieldAlert,
  Mail,
  Droplets,
  Car,
} from 'lucide-react-native';
import DigitalECard from './DigitalECard';

// Quick preset chips for custom field addition
const PRESETS = [
  { label: 'Mobile No', placeholder: '+91 98765 43210', keyboardType: 'phone-pad', icon: Phone },
  { label: 'Emergency Contact', placeholder: '+91 98765 00000', keyboardType: 'phone-pad', icon: ShieldAlert },
  { label: 'Email', placeholder: 'user@example.com', keyboardType: 'email-address', icon: Mail },
  { label: 'Blood Group', placeholder: 'O+', keyboardType: 'default', icon: Droplets },
  { label: 'Vehicle Class', placeholder: 'MCWG, LMV', keyboardType: 'default', icon: Car },
];

/**
 * Helper to mask sensitive strings:
 * - Aadhaar: XXXX XXXX 6053
 * - DL Number: HP91 •••• •••• 388
 * - DOB: ••/••/2004
 * - Address: •••••••••••, City, PIN
 */
function getMaskedDisplayValue(key, value) {
  if (!value || typeof value !== 'string') return value;
  const k = key.toLowerCase();

  // Aadhaar masking: preserve only last 4 digits
  if (k.includes('aadhaar')) {
    const cleanDigits = value.replace(/\D/g, '');
    if (cleanDigits.length >= 4) {
      const last4 = cleanDigits.slice(-4);
      return `XXXX XXXX ${last4}`;
    }
    return 'XXXX XXXX ••••';
  }

  // Driving Licence masking: preserve state code (first 4 chars) and last 3 digits
  if (k.includes('licence') || k.includes('license') || k.includes('id_number')) {
    const clean = value.trim();
    if (clean.length > 7) {
      const prefix = clean.slice(0, 4);
      const suffix = clean.slice(-3);
      return `${prefix} •••• •••• ${suffix}`;
    }
    return '•••• •••• ••••';
  }

  // DOB masking: preserve year only
  if (k.includes('dob') || k.includes('birth')) {
    const parts = value.split(/[-/.]/);
    if (parts.length === 3) {
      const year = parts[2].length === 4 ? parts[2] : parts[0];
      return `••/••/${year}`;
    }
    return '••/••/••••';
  }

  // Address masking: hide street/house details, keep city/state/pin
  if (k.includes('address')) {
    const parts = value.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      const safeEnding = parts.slice(-2).join(', ');
      return `••••••••••••, ${safeEnding}`;
    }
    return '••••••••••••••••••••••••';
  }

  return '••••••••';
}

// Convert YYYY-MM-DD to DD/MM/YYYY
function formatDateToIndian(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

export default function ResultCard({ data, onReset }) {
  const eCardRef = useRef(null);

  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  // Custom photo management state
  const rawOriginalPhoto = data?.photo_base64 || data?.result?.photo_base64 || null;
  const [currentPhoto, setCurrentPhoto] = useState(rawOriginalPhoto);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // Modal state for adding extra fields
  const [modalVisible, setModalVisible] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customKeyboard, setCustomKeyboard] = useState('default');

  if (!data) return null;

  const docType = data.document_type || 'unknown';
  const result = data.result || {};
  const front = result.front || {};
  const back = result.back || {};
  const warnings = data.warnings || result.warnings || [];

  const isDL = docType === 'driving_licence';
  const isAadhaar = docType === 'aadhaar_card';
  const docTitle = isDL ? 'Driving Licence' : isAadhaar ? 'Aadhaar Card' : 'Identity Document';
  const genderVal = front.gender?.value || front.gender || '';

  const getVal = (field) => {
    if (!field) return null;
    if (typeof field === 'string') return field;
    return field.value || null;
  };

  // Build the initial field list from extracted backend result
  const initialFields = useMemo(() => {
    const list = [];

    // 1. Name
    const nameVal = getVal(front.name);
    if (nameVal) {
      list.push({
        id: 'name',
        key: 'name',
        label: 'Full Name',
        value: nameVal,
        displayValue: nameVal,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    // 2. Primary ID Number
    const idVal = getVal(front.id_number) || getVal(front.aadhaar_number);
    if (idVal) {
      list.push({
        id: 'id_number',
        key: isDL ? 'licence_number' : 'aadhaar_number',
        label: isDL ? 'Licence Number' : 'Aadhaar Number',
        value: idVal,
        displayValue: idVal,
        isSensitive: true,
        isHidden: false,
        isCustom: false,
        highlight: true,
      });
    }

    // 3. DOB
    const dobVal = getVal(front.dob);
    if (dobVal) {
      const formattedDOB = formatDateToIndian(dobVal);
      list.push({
        id: 'dob',
        key: 'dob',
        label: 'Date of Birth',
        value: formattedDOB,
        displayValue: formattedDOB,
        isSensitive: true,
        isHidden: false,
        isCustom: false,
      });
    }

    // 4. Gender
    if (genderVal) {
      list.push({
        id: 'gender',
        key: 'gender',
        label: 'Gender',
        value: genderVal,
        displayValue: genderVal,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    // 5. Father / Husband
    const relativeVal = getVal(front.father_or_husband_name);
    if (relativeVal) {
      list.push({
        id: 'relative',
        key: 'relative_name',
        label: 'Guardian / Father',
        value: relativeVal,
        displayValue: relativeVal,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    // 6. Blood Group
    const bgVal = getVal(front.blood_group);
    if (bgVal) {
      list.push({
        id: 'blood_group',
        key: 'blood_group',
        label: 'Blood Group',
        value: bgVal,
        displayValue: bgVal,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    // 7. Dates
    const issueVal = getVal(front.issue_date);
    if (issueVal) {
      const formattedIssue = formatDateToIndian(issueVal);
      list.push({
        id: 'issue_date',
        key: 'issue_date',
        label: 'Date of Issue',
        value: formattedIssue,
        displayValue: formattedIssue,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    const expiryVal = getVal(front.expiry_date);
    if (expiryVal) {
      const formattedExpiry = formatDateToIndian(expiryVal);
      list.push({
        id: 'expiry_date',
        key: 'expiry_date',
        label: 'Valid Till',
        value: formattedExpiry,
        displayValue: formattedExpiry,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    // 8. Address & PIN
    const addrVal = getVal(back.address);
    if (addrVal) {
      list.push({
        id: 'address',
        key: 'address',
        label: 'Address',
        value: addrVal,
        displayValue: addrVal,
        isSensitive: true,
        isHidden: false,
        isCustom: false,
        fullWidth: true,
      });
    }

    const pinVal = getVal(back.pin_code);
    if (pinVal) {
      list.push({
        id: 'pin_code',
        key: 'pin_code',
        label: 'Postal Code',
        value: pinVal,
        displayValue: pinVal,
        isSensitive: false,
        isHidden: false,
        isCustom: false,
      });
    }

    return list;
  }, [data]);

  const [fields, setFields] = useState(initialFields);

  // Toggle hiding / masking for a given field
  const toggleFieldMask = (id) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const willHide = !f.isHidden;
        return {
          ...f,
          isHidden: willHide,
          displayValue: willHide ? getMaskedDisplayValue(f.key || f.label, f.value) : f.value,
        };
      })
    );
  };

  // Add custom user field
  const handleAddCustomField = () => {
    if (!customLabel.trim() || !customValue.trim()) {
      Alert.alert('Required', 'Please enter both label and value.');
      return;
    }

    const newField = {
      id: `custom_${Date.now()}`,
      key: customLabel.toLowerCase().replace(/\s+/g, '_'),
      label: customLabel.trim(),
      value: customValue.trim(),
      displayValue: customValue.trim(),
      isSensitive: false,
      isHidden: false,
      isCustom: true,
    };

    setFields((prev) => [...prev, newField]);
    setCustomLabel('');
    setCustomValue('');
    setModalVisible(false);
  };

  // Delete custom field
  const handleDeleteField = (id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  // Pick custom photo from user phone gallery
  const handlePickGalleryPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow gallery access to select a photo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setCurrentPhoto(res.assets[0].uri);
        setPhotoModalVisible(false);
      }
    } catch (e) {
      Alert.alert('Photo Error', e.message);
    }
  };

  // Remove photo and use gender silhouette avatar
  const handleRemovePhoto = () => {
    setCurrentPhoto(null);
    setPhotoModalVisible(false);
  };

  // Reset to original document photo
  const handleResetDocumentPhoto = () => {
    setCurrentPhoto(rawOriginalPhoto);
    setPhotoModalVisible(false);
  };

  // Extract name and primary ID for eCard hero section
  const cardholderName = fields.find((f) => f.id === 'name')?.displayValue || 'CARDHOLDER';
  const rawIdField = fields.find((f) => f.id === 'id_number');
  const cardholderId = rawIdField ? rawIdField.displayValue : '—';

  // 1. Share eCard as PNG Image (using ViewShot + expo-sharing)
  const handleShareECardImage = async () => {
    if (!eCardRef.current) return;
    try {
      setSharingImage(true);
      const uri = await captureRef(eCardRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share ${docTitle} eCard`,
          UTI: 'public.png',
        });
      } else {
        await Share.share({
          title: `Carta ${docTitle}`,
          url: uri,
        });
      }
    } catch (err) {
      Alert.alert('Share Failed', 'Unable to capture eCard image. ' + err.message);
    } finally {
      setSharingImage(false);
    }
  };

  // 2. Share / Copy as formatted plain text (honors masked values)
  const handleCopyText = async () => {
    try {
      const summaryLines = [
        `📄 ${docTitle.toUpperCase()} (via Carta)`,
        '─────────────────────',
        ...fields
          .filter((f) => !f.isHidden || f.isSensitive)
          .map((f) => `${f.label}: ${f.displayValue}`),
        '─────────────────────',
      ];

      await Share.share({
        message: summaryLines.join('\n'),
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* 1. Apple-Style Clean Light Digital eCard */}
      <View style={styles.cardPreviewSection}>
        <DigitalECard
          ref={eCardRef}
          docType={docType}
          name={cardholderName}
          idNumber={cardholderId}
          photoUri={currentPhoto}
          gender={genderVal}
          activeFields={fields}
          onPhotoPress={() => setPhotoModalVisible(true)}
        />
      </View>

      {/* 2. Buttery Light & Elegant Primary Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.shareImageBtn}
          onPress={handleShareECardImage}
          activeOpacity={0.7}
          disabled={sharingImage}
        >
          <Share2 size={16} color="#1E293B" strokeWidth={2} />
          <Text style={styles.shareImageBtnText}>
            {sharingImage ? 'Generating...' : 'Share eCard'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.copyTextBtn}
          onPress={handleCopyText}
          activeOpacity={0.7}
        >
          {copied ? (
            <Check size={16} color="#059669" strokeWidth={2.2} />
          ) : (
            <Copy size={16} color="#475569" strokeWidth={2} />
          )}
          <Text style={[styles.copyTextBtnText, copied && styles.copyTextBtnTextSuccess]}>
            {copied ? 'Copied' : 'Copy Text'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Privacy & Field Customization Sheet */}
      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <View style={styles.settingsHeaderTextCol}>
            <Text style={styles.settingsTitle}>Card Details & Privacy</Text>
            <Text style={styles.settingsSubtitle}>
              Tap the eye to mask fields before sharing
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addDetailBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.7}
          >
            <Plus size={13} color="#2563EB" strokeWidth={2.5} />
            <Text style={styles.addDetailBtnText}>Add Detail</Text>
          </TouchableOpacity>
        </View>

        {/* Dedicated Card Photo Row */}
        <View style={styles.photoControlRow}>
          <View style={styles.photoControlLeft}>
            <View style={styles.photoThumbPreview}>
              {currentPhoto ? (
                <Image
                  source={{
                    uri:
                      currentPhoto.startsWith('data:') ||
                      currentPhoto.startsWith('file:') ||
                      currentPhoto.startsWith('http')
                        ? currentPhoto
                        : `data:image/jpeg;base64,${currentPhoto}`,
                  }}
                  style={styles.photoThumbImg}
                />
              ) : (
                <User size={18} color="#64748B" strokeWidth={1.75} />
              )}
            </View>
            <View>
              <Text style={styles.photoControlLabel}>CARD PHOTO</Text>
              <Text style={styles.photoControlStatus}>
                {currentPhoto ? (currentPhoto === rawOriginalPhoto ? 'Document Photo' : 'Custom Gallery Photo') : 'Silhouette Avatar'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.photoChangeBtn}
            onPress={() => setPhotoModalVisible(true)}
            activeOpacity={0.7}
          >
            <Camera size={13} color="#475569" strokeWidth={2} />
            <Text style={styles.photoChangeBtnText}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* List of interactive fields */}
        <View style={styles.fieldList}>
          {fields.map((f, idx) => (
            <View key={f.id || idx} style={styles.fieldRow}>
              <View style={styles.fieldMain}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {f.isCustom && (
                    <View style={styles.customPill}>
                      <Text style={styles.customPillText}>Custom</Text>
                    </View>
                  )}
                  {f.isHidden && (
                    <View style={styles.maskedPill}>
                      <Text style={styles.maskedPillText}>Masked</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.fieldVal, f.isHidden && styles.fieldValMasked]}>
                  {f.displayValue}
                </Text>
              </View>

              {/* Action buttons on row */}
              <View style={styles.fieldActions}>
                {/* Mask / Unmask Toggle Button with Monochrome Lucide Icons */}
                <TouchableOpacity
                  style={[styles.maskToggleBtn, f.isHidden && styles.maskToggleBtnActive]}
                  onPress={() => toggleFieldMask(f.id)}
                  activeOpacity={0.7}
                >
                  {f.isHidden ? (
                    <EyeOff size={14} color="#B45309" strokeWidth={1.8} />
                  ) : (
                    <Eye size={14} color="#475569" strokeWidth={1.8} />
                  )}
                  <Text style={[styles.maskToggleText, f.isHidden && styles.maskToggleTextActive]}>
                    {f.isHidden ? 'Masked' : 'Visible'}
                  </Text>
                </TouchableOpacity>

                {/* Delete button for custom added fields */}
                {f.isCustom && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteField(f.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={13} color="#DC2626" strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 4. Notes / Disclaimers (subtle) */}
      {warnings && warnings.length > 0 && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeHeading}>Notes</Text>
          {warnings.map((w, idx) => (
            <Text key={idx} style={styles.noticeText}>
              &bull; {w}
            </Text>
          ))}
        </View>
      )}

      {/* 5. Footer Reset Action */}
      <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.8}>
        <Text style={styles.resetBtnText}>Scan Another Document</Text>
      </TouchableOpacity>

      {/* 6. Apple-Style Photo Selection Modal */}
      <Modal
        visible={photoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View style={styles.actionSheetContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.actionSheetTitle}>Cardholder Photo</Text>
            <Text style={styles.actionSheetSubtitle}>
              Customize the portrait displayed on your Carta eCard
            </Text>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handlePickGalleryPhoto}
              activeOpacity={0.7}
            >
              <View style={styles.actionSheetIconWrapper}>
                <ImageIcon size={18} color="#2563EB" strokeWidth={2} />
              </View>
              <View style={styles.actionSheetOptionTextCol}>
                <Text style={styles.actionSheetOptionTitle}>Choose from Gallery</Text>
                <Text style={styles.actionSheetOptionDesc}>Pick a clear portrait from your photo library</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleRemovePhoto}
              activeOpacity={0.7}
            >
              <View style={styles.actionSheetIconWrapper}>
                <User size={18} color="#64748B" strokeWidth={2} />
              </View>
              <View style={styles.actionSheetOptionTextCol}>
                <Text style={styles.actionSheetOptionTitle}>Use Silhouette Avatar</Text>
                <Text style={styles.actionSheetOptionDesc}>Remove photo and display a gender-aware avatar</Text>
              </View>
            </TouchableOpacity>

            {rawOriginalPhoto && currentPhoto !== rawOriginalPhoto && (
              <TouchableOpacity
                style={styles.actionSheetOption}
                onPress={handleResetDocumentPhoto}
                activeOpacity={0.7}
              >
                <View style={styles.actionSheetIconWrapper}>
                  <RotateCcw size={18} color="#059669" strokeWidth={2} />
                </View>
                <View style={styles.actionSheetOptionTextCol}>
                  <Text style={styles.actionSheetOptionTitle}>Reset to Document Photo</Text>
                  <Text style={styles.actionSheetOptionDesc}>Revert to the original photo from the ID card</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionSheetCancelBtn}
              onPress={() => setPhotoModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionSheetCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 7. Apple-Style Slide-Up Modal Sheet for Adding Details */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Custom Detail</Text>
            <Text style={styles.modalSubtitle}>
              Include phone, email, or emergency contact on your eCard.
            </Text>

            {/* Quick Presets with Clean Vector Icons */}
            <Text style={styles.presetHeading}>QUICK PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {PRESETS.map((p, i) => {
                const IconComponent = p.icon;
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.presetChip}
                    onPress={() => {
                      setCustomLabel(p.label);
                      setCustomKeyboard(p.keyboardType);
                    }}
                    activeOpacity={0.7}
                  >
                    <IconComponent size={13} color="#475569" strokeWidth={1.8} />
                    <Text style={styles.presetChipText}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Inputs */}
            <Text style={styles.inputLabel}>LABEL</Text>
            <TextInput
              style={styles.textInput}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder="e.g. Mobile No, Policy No"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>VALUE</Text>
            <TextInput
              style={styles.textInput}
              value={customValue}
              onChangeText={setCustomValue}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor="#94A3B8"
              keyboardType={customKeyboard}
            />

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setCustomLabel('');
                  setCustomValue('');
                  setModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddCustomField}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSubmitBtnText}>Add to Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    backgroundColor: '#F1F5F9',
  },
  cardPreviewSection: {
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shareImageBtn: {
    flex: 1.25,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shareImageBtnText: {
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  copyTextBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  copyTextBtnText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '600',
  },
  copyTextBtnTextSuccess: {
    color: '#059669',
    fontWeight: '700',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingsHeaderTextCol: {
    flex: 1,
    marginRight: 10,
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  settingsSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  addDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addDetailBtnText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  photoControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  photoControlLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoThumbPreview: {
    width: 38,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  photoThumbImg: {
    width: '100%',
    height: '100%',
  },
  photoControlLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  photoControlStatus: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  photoChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  photoChangeBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  fieldList: {
    flexDirection: 'column',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  fieldMain: {
    flex: 1,
    marginRight: 10,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  customPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  customPillText: {
    color: '#2563EB',
    fontSize: 9.5,
    fontWeight: '700',
  },
  maskedPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  maskedPillText: {
    color: '#D97706',
    fontSize: 9.5,
    fontWeight: '700',
  },
  fieldVal: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  fieldValMasked: {
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  maskToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  maskToggleBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  maskToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  maskToggleTextActive: {
    color: '#B45309',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  noticeHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 12,
    color: '#92400E',
    marginBottom: 2,
    lineHeight: 16,
  },
  resetBtn: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  actionSheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 18,
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionSheetIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetOptionTextCol: {
    flex: 1,
  },
  actionSheetOptionTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  actionSheetOptionDesc: {
    fontSize: 11.5,
    color: '#64748B',
  },
  actionSheetCancelBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  presetScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: '#0F172A',
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
