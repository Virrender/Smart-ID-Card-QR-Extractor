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
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import DigitalECard from './DigitalECard';

// Quick preset chips for custom field addition
const PRESETS = [
  { label: 'Mobile No', placeholder: '+91 98765 43210', keyboardType: 'phone-pad', icon: '📞' },
  { label: 'Emergency Contact', placeholder: '+91 98765 00000', keyboardType: 'phone-pad', icon: '🚨' },
  { label: 'Email', placeholder: 'user@example.com', keyboardType: 'email-address', icon: '✉️' },
  { label: 'Blood Group', placeholder: 'O+', keyboardType: 'default', icon: '🩸' },
  { label: 'Vehicle Class', placeholder: 'MCWG, LMV', keyboardType: 'default', icon: '🚗' },
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

  const [activeTab, setActiveTab] = useState('card'); // 'card' or 'details'
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);

  // Modal state for adding extra fields
  const [modalVisible, setModalVisible] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customKeyboard, setCustomKeyboard] = useState('default');

  if (!data) return null;

  const docType = data.document_type || 'unknown';
  const source = data.extraction_source || 'ocr';
  const result = data.result || {};
  const status = result.status || 'success';
  const front = result.front || {};
  const back = result.back || {};
  const photoB64 = data.photo_base64 || result.photo_base64;
  const warnings = data.warnings || result.warnings || [];

  const isDL = docType === 'driving_licence';
  const isAadhaar = docType === 'aadhaar_card';
  const docTitle = isDL ? 'Driving Licence' : isAadhaar ? 'Aadhaar Card' : 'Identity Document';

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
    const genderVal = getVal(front.gender);
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
        `📄 ${docTitle.toUpperCase()} DETAILS (via Carta)`,
        '━━━━━━━━━━━━━━━━━━━━━',
        ...fields
          .filter((f) => !f.isHidden || f.isSensitive)
          .map((f) => `${f.label}: ${f.displayValue}`),
        '━━━━━━━━━━━━━━━━━━━━━',
        'Verified locally with Carta Engine',
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
      {/* 1. iOS-Style Segmented Control: eCard vs Detailed Table */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'card' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('card')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'card' && styles.segmentTextActive]}>
            🪪 Digital eCard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'details' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('details')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, activeTab === 'details' && styles.segmentTextActive]}>
            📋 Data & Privacy
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. Apple Wallet-Inspired Digital eCard Preview */}
      <View style={styles.cardPreviewSection}>
        <DigitalECard
          ref={eCardRef}
          docType={docType}
          name={cardholderName}
          idNumber={cardholderId}
          photoBase64={photoB64}
          activeFields={fields}
          isVerified={status === 'success'}
        />
      </View>

      {/* 3. Primary Sharing & Export Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.shareImageBtn}
          onPress={handleShareECardImage}
          activeOpacity={0.8}
          disabled={sharingImage}
        >
          <Text style={styles.shareImageBtnText}>
            {sharingImage ? 'Generating image...' : '📤 Share eCard (Image)'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.copyTextBtn}
          onPress={handleCopyText}
          activeOpacity={0.8}
        >
          <Text style={styles.copyTextBtnText}>
            {copied ? '✓ Copied' : '📋 Copy Text'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. Privacy & Field Customization Sheet */}
      <View style={styles.settingsCard}>
        <View style={styles.settingsHeader}>
          <View>
            <Text style={styles.settingsTitle}>Privacy & Customization</Text>
            <Text style={styles.settingsSubtitle}>
              Tap the eye icon to mask details before sharing
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addDetailBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addDetailBtnText}>+ Add Field</Text>
          </TouchableOpacity>
        </View>

        {/* List of interactive fields */}
        <View style={styles.fieldList}>
          {fields.map((f, idx) => (
            <View key={f.id || idx} style={styles.fieldRow}>
              <View style={styles.fieldMain}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {f.isCustom && <View style={styles.customPill}><Text style={styles.customPillText}>Custom</Text></View>}
                  {f.isHidden && <View style={styles.maskedPill}><Text style={styles.maskedPillText}>Masked</Text></View>}
                </View>
                <Text style={[styles.fieldVal, f.isHidden && styles.fieldValMasked]}>
                  {f.displayValue}
                </Text>
              </View>

              {/* Action buttons on row */}
              <View style={styles.fieldActions}>
                {/* Mask / Unmask Toggle Button */}
                <TouchableOpacity
                  style={[styles.maskToggleBtn, f.isHidden && styles.maskToggleBtnActive]}
                  onPress={() => toggleFieldMask(f.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.maskToggleIcon}>{f.isHidden ? '🙈' : '👁️'}</Text>
                  <Text style={[styles.maskToggleText, f.isHidden && styles.maskToggleTextActive]}>
                    {f.isHidden ? 'Hidden' : 'Visible'}
                  </Text>
                </TouchableOpacity>

                {/* Delete button for custom added fields */}
                {f.isCustom && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteField(f.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 5. Warnings / Notes (Subdued) */}
      {warnings && warnings.length > 0 && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeHeading}>Notes & Disclaimers</Text>
          {warnings.map((w, idx) => (
            <Text key={idx} style={styles.noticeText}>
              &bull; {w}
            </Text>
          ))}
        </View>
      )}

      {/* 6. Footer Reset Action */}
      <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.8}>
        <Text style={styles.resetBtnText}>Scan Another Document</Text>
      </TouchableOpacity>

      {/* 7. Modal Sheet for Adding Extra Information */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Custom Information</Text>
            <Text style={styles.modalSubtitle}>
              Include extra details (phone, emergency contact) to your digital eCard.
            </Text>

            {/* Preset Suggestions */}
            <Text style={styles.presetHeading}>QUICK PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {PRESETS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.presetChip}
                  onPress={() => {
                    setCustomLabel(p.label);
                    setCustomKeyboard(p.keyboardType);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetChipText}>{p.icon} {p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Inputs */}
            <Text style={styles.inputLabel}>FIELD LABEL</Text>
            <TextInput
              style={styles.textInput}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder="e.g. Mobile, Policy No"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>FIELD VALUE</Text>
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
                <Text style={styles.modalSubmitBtnText}>Add to eCard</Text>
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
    paddingTop: 12,
    paddingBottom: 48,
    backgroundColor: '#F1F5F9',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  cardPreviewSection: {
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shareImageBtn: {
    flex: 1.3,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  shareImageBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  copyTextBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyTextBtnText: {
    color: '#334155',
    fontSize: 13.5,
    fontWeight: '600',
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
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  addDetailBtnText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 11.5,
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
    color: '#3B82F6',
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
  maskToggleIcon: {
    fontSize: 13,
    marginRight: 4,
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
  deleteBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
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
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
