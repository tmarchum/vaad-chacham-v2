package il.co.vaadplus;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

/** Restart the auto-gate service after a reboot if the user left it enabled. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        SharedPreferences p = ctx.getSharedPreferences(AutoGateService.PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean("enabled", false)) return;

        // Android 14+ throws ForegroundServiceStartNotAllowedException when a
        // location FGS starts from BOOT_COMPLETED without background location —
        // that must not crash the process on every boot.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            Intent svc = new Intent(ctx, AutoGateService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(svc);
            else ctx.startService(svc);
        } catch (Exception ignored) {
            // The user will re-enable from the app; never crash on boot.
        }
    }
}
