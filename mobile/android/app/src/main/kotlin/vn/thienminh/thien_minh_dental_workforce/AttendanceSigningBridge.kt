package vn.thienminh.thien_minh_dental_workforce

import android.app.Activity
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import io.flutter.plugin.common.MethodChannel
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/** Private key never crosses into Dart. This does NOT attest the app/GPS to Backend. */
class AttendanceSigningBridge(private val activity: Activity, private val channel: MethodChannel) {
    private var pending: MethodChannel.Result? = null
    private var cancellation: CancellationSignal? = null
    private val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    init {
        channel.setMethodCallHandler { call, result ->
            val owner = call.argument<String>("owner") ?: ""
            if (!owner.matches(Regex("[a-fA-F0-9-]{36}"))) {
                result.error("DEVICE_OWNER_INVALID", "Tài khoản thiết bị không hợp lệ.", null)
            } else if (Build.VERSION.SDK_INT < 28) {
                result.error("BIOMETRIC_UNAVAILABLE", "Máy chưa hỗ trợ xác thực sinh trắc an toàn. Liên hệ Admin để giải trình/điều chỉnh công.", null)
            } else if (pending != null) {
                result.error("BIOMETRIC_BUSY", "Đang có lượt xác thực khác.", null)
            } else {
                try {
                    val alias = "tm.attendance.v1." + MessageDigest.getInstance("SHA-256")
                        .digest(owner.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
                    when (call.method) {
                        "publicKey" -> {
                            ensureKey(alias)
                            result.success(Base64.encodeToString(store.getCertificate(alias).publicKey.encoded, Base64.NO_WRAP))
                        }
                        "resetKey" -> {
                            // Only explicit UI recovery. Backend still requires Admin approval of the new key.
                            store.deleteEntry(alias)
                            ensureKey(alias)
                            result.success(null)
                        }
                        "sign" -> {
                            val payload = call.argument<String>("payload") ?: ""
                            if (payload.isEmpty() || payload.length > 4096 || !store.containsAlias(alias)) {
                                result.error("DEVICE_KEY_MISSING", "Chưa có khóa thiết bị hợp lệ.", null)
                            } else sign(alias, payload, result)
                        }
                        else -> result.notImplemented()
                    }
                } catch (_: KeyPermanentlyInvalidatedException) {
                    result.error("DEVICE_KEY_INVALIDATED", "Sinh trắc/khóa máy đã thay đổi. Tạo khóa mới và nhờ Admin xác nhận lại thiết bị.", null)
                } catch (_: Exception) {
                    result.error("BIOMETRIC_UNAVAILABLE", "Không dùng được khóa sinh trắc. Kiểm tra vân tay/khuôn mặt mạnh đã đăng ký; liên hệ Admin nếu máy không hỗ trợ.", null)
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun ensureKey(alias: String) {
        if (store.containsAlias(alias)) return
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
        if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        else spec.setUserAuthenticationValidityDurationSeconds(-1)
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        generator.initialize(spec.build())
        generator.generateKeyPair()
    }

    private fun sign(alias: String, payload: String, result: MethodChannel.Result) {
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(store.getKey(alias, null) as PrivateKey)
        val cancel = CancellationSignal()
        cancellation = cancel
        pending = result
        val builder = BiometricPrompt.Builder(activity)
            .setTitle("Xác thực chấm công")
            .setSubtitle("Vân tay/khuôn mặt mạnh cho riêng lượt vào/ra này")
            .setNegativeButton("Hủy", activity.mainExecutor) { _, _ ->
                if (pending !== result) return@setNegativeButton
                cancel.cancel()
                finishError("BIOMETRIC_CANCELLED", "Đã hủy xác thực; chưa gửi chấm công.")
            }
        if (Build.VERSION.SDK_INT >= 30) builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        try {
            builder.build().authenticate(BiometricPrompt.CryptoObject(signature), cancel, activity.mainExecutor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (pending !== result) return
                        finishError("BIOMETRIC_FAILED", "Không hoàn tất xác thực: $errString. Chưa gửi chấm công.")
                    }
                    override fun onAuthenticationSucceeded(auth: BiometricPrompt.AuthenticationResult) {
                        if (pending !== result) return
                        val reply = pending ?: return
                        try {
                            val signer = auth.cryptoObject?.signature ?: throw IllegalStateException()
                            signer.update(payload.toByteArray(Charsets.UTF_8))
                            val signed = Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
                            pending = null; cancellation = null
                            reply.success(signed)
                        } catch (_: Exception) {
                            finishError("BIOMETRIC_FAILED", "Không ký được lượt chấm công; hãy thử lại.")
                        }
                    }
                })
        } catch (_: Exception) {
            finishError("BIOMETRIC_UNAVAILABLE", "Không mở được xác thực sinh trắc; chưa gửi chấm công.")
        }
    }

    private fun finishError(code: String, message: String) {
        val reply = pending
        pending = null; cancellation = null
        reply?.error(code, message, null)
    }

    fun dispose() {
        val cancel = cancellation
        finishError("BIOMETRIC_CANCELLED", "Ứng dụng đã đóng; chưa gửi chấm công.")
        cancel?.cancel()
        channel.setMethodCallHandler(null)
    }
}
