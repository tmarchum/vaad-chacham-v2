package il.co.vaadplus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/** Restart the auto-gate service after a reboot if the user left it enabled. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        SharedPreferences p = ctx.getSharedPreferences(AutoGateService.PREFS, Context.MODE_PRIVATE);
        if (p.getBoolean("enabled", false)) {
            Intent svc = new Intent(ctx, AutoGateService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(svc);
            else ctx.startService(svc);
        }
    }
}
