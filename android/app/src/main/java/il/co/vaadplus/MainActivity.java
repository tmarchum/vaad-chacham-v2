package il.co.vaadplus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutoGatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
