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

    /** Either a file URI or a shared link (url + optional title). */
    private static final class Pending {
        final Uri uri;
        final String url;
        final String title;
        Pending(Uri uri, String url, String title) { this.uri = uri; this.url = url; this.title = title; }
    }

    private static final Deque<Pending> pending = new ArrayDeque<>();
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
        String url = null;
        String title = null;
        if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) {
                // A shared link: browsers put the URL (sometimes with the title) in EXTRA_TEXT.
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                if (text != null) url = text;
            }
        } else if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        }
        if (uri == null && url == null) return;

        synchronized (pending) {
            pending.add(new Pending(uri, url, title));
        }
        if (instance != null) {
            instance.notifyListeners("fileShared", new JSObject(), true);
        }
    }

    @PluginMethod
    public void getPendingFile(PluginCall call) {
        Pending item;
        synchronized (pending) {
            item = pending.poll();
        }
        JSObject result = new JSObject();
        if (item == null) {
            result.put("path", JSObject.NULL);
            call.resolve(result);
            return;
        }
        if (item.uri == null) {
            result.put("path", JSObject.NULL);
            result.put("url", item.url);
            if (item.title != null) result.put("title", item.title);
            call.resolve(result);
            return;
        }
        Uri uri = item.uri;

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
