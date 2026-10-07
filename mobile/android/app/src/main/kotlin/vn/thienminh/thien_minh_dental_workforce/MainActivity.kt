package vn.thienminh.thien_minh_dental_workforce

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Build
import android.net.Uri
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelId = "announcements"
    private var bridge: MethodChannel? = null
    private val notificationPermissionCode = 6107
    private var permissionResult: MethodChannel.Result? = null

    private fun notificationStatus(manager: NotificationManager): Map<String, Any> {
        val runtimeRequired = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        val granted = !runtimeRequired ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val asked = getPreferences(MODE_PRIVATE).getBoolean("notifications_requested", false)
        return mapOf(
            "enabled" to manager.areNotificationsEnabled(),
            "permissionGranted" to granted,
            "canRequestPermission" to (runtimeRequired && !granted &&
                (!asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))),
            "importance" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                (manager.getNotificationChannel(channelId)?.importance ?: 0) else 4
        )
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(
                channelId, "Thông báo Thiên Minh", NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Thông báo nội bộ và kết quả xử lý đơn" })
        }
        bridge = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "vn.thienminh/notifications")
        bridge?.setMethodCallHandler { call, result ->
            when (call.method) {
                "status" -> result.success(notificationStatus(manager))
                "requestPermission" -> {
                    if (permissionResult != null) {
                        result.error("PERMISSION_REQUEST_BUSY", "Permission request already open", null)
                    } else if (notificationStatus(manager)["canRequestPermission"] != true) {
                        result.success(notificationStatus(manager))
                    } else {
                        permissionResult = result
                        getPreferences(MODE_PRIVATE).edit().putBoolean("notifications_requested", true).apply()
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), notificationPermissionCode)
                    }
                }
                "clear" -> { manager.cancelAll(); result.success(null) }
                "initialTap" -> result.success(consumeTap(intent))
                "settings" -> {
                    val settings = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:$packageName"))
                    startActivity(settings)
                    result.success(null)
                }
                "show" -> {
                    val id = call.argument<String>("id") ?: ""
                    val owner = call.argument<String>("owner") ?: ""
                    if (id.isBlank() || owner.isBlank()) {
                        result.error("INVALID_NOTIFICATION", "Missing notification identity", null)
                    } else if (!manager.areNotificationsEnabled() ||
                        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                            manager.getNotificationChannel(channelId)?.importance == NotificationManager.IMPORTANCE_NONE)) {
                        result.success(false)
                    } else {
                        val open = Intent(this, MainActivity::class.java)
                            .setAction("vn.thienminh.OPEN_NOTIFICATION.$id")
                            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            .putExtra("workforce_announcement_id", id)
                            .putExtra("workforce_owner", owner)
                        val pending = PendingIntent.getActivity(this, id.hashCode(), open,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                            Notification.Builder(this, channelId) else Notification.Builder(this)
                        val publicBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                            Notification.Builder(this, channelId) else Notification.Builder(this)
                        val notification = builder
                            .setSmallIcon(R.drawable.ic_notification)
                            .setContentTitle(call.argument<String>("title") ?: "Thiên Minh Workforce")
                            .setContentText(call.argument<String>("body") ?: "Bạn có thông báo mới")
                            .setStyle(Notification.BigTextStyle().bigText(call.argument<String>("body")))
                            .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
                            .setCategory(Notification.CATEGORY_MESSAGE)
                            .setVisibility(Notification.VISIBILITY_PRIVATE)
                            .setPublicVersion(publicBuilder.setSmallIcon(R.drawable.ic_notification)
                                .setContentTitle("Thiên Minh Workforce")
                                .setContentText("Bạn có thông báo mới").build())
                            .setPriority(Notification.PRIORITY_HIGH)
                            .setDefaults(Notification.DEFAULT_SOUND).build()
                        try {
                            manager.notify(id, 0, notification)
                            result.success(true)
                        } catch (_: SecurityException) { result.success(false) }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == notificationPermissionCode) {
            permissionResult?.success(notificationStatus(getSystemService(NotificationManager::class.java)))
            permissionResult = null
        }
    }

    private fun consumeTap(source: Intent?): Map<String, String>? {
        val id = source?.getStringExtra("workforce_announcement_id") ?: return null
        val owner = source.getStringExtra("workforce_owner") ?: return null
        source.removeExtra("workforce_announcement_id")
        source.removeExtra("workforce_owner")
        return mapOf("id" to id, "owner" to owner)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeTap(intent)?.let { bridge?.invokeMethod("tap", it) }
    }
}
