package dev.skim.reader;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Receives EPUB/PDF files shared to Skim (ACTION_SEND) or opened with Skim
 * (ACTION_VIEW). The file is copied into the app cache and the web layer
 * fetches it through Capacitor's local file URL, so large books never pass
 * through the JS bridge as strings.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static final Deque<Uri> pending = new ArrayDeque<>();
    private static ShareReceiverPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Called by MainActivity for the launch intent and every new intent. */
    static void onIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        }
        if (uri == null) return;

        synchronized (pending) {
            pending.add(uri);
        }
        if (instance != null) {
            instance.notifyListeners("fileShared", new JSObject(), true);
        }
    }

    @PluginMethod
    public void getPendingFile(PluginCall call) {
        Uri uri;
        synchronized (pending) {
            uri = pending.poll();
        }
        JSObject result = new JSObject();
        if (uri == null) {
            result.put("path", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            String name = displayName(uri);
            String mime = getContext().getContentResolver().getType(uri);
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, System.currentTimeMillis() + "-" + name);

            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream os = new FileOutputStream(out)) {
                if (in == null) throw new IllegalStateException("Cannot open " + uri);
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }

            result.put("path", out.getAbsolutePath());
            result.put("name", name);
            result.put("mimeType", mime);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read shared file: " + e.getMessage(), e);
        }
    }

    private String displayName(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) name = c.getString(idx);
                }
            } catch (Exception ignored) {
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "shared.epub";
        return name.replaceAll("[^A-Za-z0-9._ -]", "_");
    }
}
