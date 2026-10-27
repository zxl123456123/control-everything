import type { ReactNode } from 'react'
import { useState } from 'react'
import { ActivityIndicator, Linking, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { ClipboardPaste, QrCode } from 'lucide-react-native'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CeSheet } from '../components/CeSheet'
import { CeText } from '../components/CeText'
import { Expandable, Note } from '../components/Expandable'
import { ScreenFrame } from '../components/ScreenFrame'
import { copy } from '../copy'
import { SuccessCheck } from '../motion/SuccessCheck'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'
import { usePairFlow, type PairStatus } from './use-pair-flow'

/** Screen 5 as a pure view: scan frame, paste sheet, connecting, success, error. */
export function PairView({
  status,
  errorMessage,
  camera,
  onPasteOpen,
  onRetry,
  onCancel
}: {
  status: PairStatus
  errorMessage: string
  /** The live camera preview, or its permission prompt; injected so previews can stub it. */
  camera: ReactNode
  onPasteOpen: () => void
  onRetry: () => void
  onCancel: () => void
}) {
  const { c } = useCeTheme()
  if (status === 'connecting') {
    return (
      <View
        style={{ alignItems: 'center', gap: ceSpace.lg, paddingVertical: ceSpace.giant }}
        testID="ce-pair-connecting"
      >
        <ActivityIndicator size="large" color={c.accentText} />
        <CeText variant="headline">{copy.pair.connecting}</CeText>
        <Button label={copy.pair.cancel} variant="ghost" onPress={onCancel} />
      </View>
    )
  }
  if (status === 'success') {
    return (
      <View
        style={{ alignItems: 'center', gap: ceSpace.lg, paddingVertical: ceSpace.giant }}
        testID="ce-pair-success"
      >
        <SuccessCheck />
        <CeText variant="title">已配对</CeText>
      </View>
    )
  }
  return (
    <View style={{ gap: ceSpace.lg }}>
      {status === 'error' ? (
        <Banner
          tone="danger"
          testID="ce-pair-error"
          title={errorMessage}
          action={<Button label={copy.pair.retry} variant="secondary" onPress={onRetry} />}
        />
      ) : (
        <>
          {camera}
          <Button
            testID="ce-pair-paste"
            label={copy.pair.paste}
            icon={<ClipboardPaste size={18} color={c.text} />}
            onPress={onPasteOpen}
          />
        </>
      )}
      <Expandable>
        {copy.pair.learnMore.map((line) => (
          <Note key={line}>{line}</Note>
        ))}
      </Expandable>
    </View>
  )
}

function PasteSheet({
  visible,
  onClose,
  onSubmit
}: {
  visible: boolean
  onClose: () => void
  onSubmit: (value: string) => void
}) {
  const { c } = useCeTheme()
  const [value, setValue] = useState('')
  return (
    <CeSheet visible={visible} onClose={onClose} title={copy.pair.pasteTitle}>
      <TextInput
        testID="ce-pair-code-input"
        accessibilityLabel={copy.pair.pasteTitle}
        value={value}
        onChangeText={setValue}
        placeholder={copy.pair.pastePlaceholder}
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={{
          minHeight: 96,
          padding: ceSpace.md,
          borderRadius: ceRadii.input,
          borderWidth: 1,
          borderColor: c.fieldEdge,
          backgroundColor: c.field,
          color: c.text,
          fontSize: 16,
          textAlignVertical: 'top'
        }}
      />
      <Button
        variant="primary"
        label={copy.pair.pasteSubmit}
        disabled={value.trim().length === 0}
        onPress={() => {
          onSubmit(value)
          setValue('')
        }}
      />
    </CeSheet>
  )
}

export function PairScreen() {
  const router = useRouter()
  const { c } = useCeTheme()
  const flow = usePairFlow()
  const [permission, requestPermission] = useCameraPermissions()
  const [pasteOpen, setPasteOpen] = useState(false)

  const camera = !permission ? (
    <View style={{ height: 280, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={c.muted} />
    </View>
  ) : !permission.granted ? (
    <Card style={{ gap: ceSpace.md, alignItems: 'center', padding: ceSpace.xl }}>
      <QrCode size={40} color={c.accentText} strokeWidth={1.6} />
      <CeText variant="headline">{copy.pair.cameraNeeded}</CeText>
      <View style={{ alignSelf: 'stretch' }}>
        <Button
          variant="primary"
          label={copy.pair.allowCamera}
          onPress={() =>
            permission.canAskAgain === false
              ? void Linking.openSettings()
              : void requestPermission()
          }
        />
      </View>
    </Card>
  ) : (
    <View
      style={{
        height: 320,
        borderRadius: ceRadii.card,
        overflow: 'hidden',
        backgroundColor: '#000'
      }}
      accessibilityLabel="相机取景框，对准电脑上的二维码"
    >
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => flow.submitQr(data)}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 200,
            height: 200,
            borderRadius: ceRadii.card,
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.85)'
          }}
        />
      </View>
    </View>
  )

  return (
    <View ref={flow.rootRef as never} collapsable={false} style={{ flex: 1 }}>
      <ScreenFrame
        title={copy.pair.title}
        subtitle={copy.pair.subtitle}
        onBack={() => router.back()}
      >
        <PairView
          status={flow.status}
          errorMessage={flow.errorMessage}
          camera={camera}
          onPasteOpen={() => setPasteOpen(true)}
          onRetry={flow.retry}
          onCancel={flow.cancel}
        />
        <PasteSheet
          visible={pasteOpen}
          onClose={() => setPasteOpen(false)}
          onSubmit={(value) => {
            setPasteOpen(false)
            flow.submitCode(value)
          }}
        />
      </ScreenFrame>
    </View>
  )
}
