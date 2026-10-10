# RippleHub — ProGuard / R8 rules for release builds
# These rules prevent R8 from stripping or renaming classes that React Native,
# its native modules, and third-party libraries access via reflection.

# ── React Native core ────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ── React Native modules registered by name (accessed via reflection) ─────────
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.ReactPackage { *; }

# ── Kotlin & coroutines ───────────────────────────────────────────────────────
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlin.**

# ── Firebase / Google services ────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── OkHttp / networking (used internally by many libraries) ──────────────────
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Sentry ────────────────────────────────────────────────────────────────────
-keep class io.sentry.** { *; }
-keep class io.sentry.android.** { *; }
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable   # preserves stack trace line numbers in Sentry
-keep public class * extends java.lang.Exception  # keeps exception class names readable
-dontwarn io.sentry.**

# ── React Native Blob Util ────────────────────────────────────────────────────
-keep class com.RNFetchBlob.** { *; }

# ── React Native Document Picker ──────────────────────────────────────────────
-keep class io.github.elc1798.** { *; }

# ── React Native Image Picker ─────────────────────────────────────────────────
-keep class com.imagepicker.** { *; }

# ── React Native Camera / video ───────────────────────────────────────────────
-keep class com.brentvatne.** { *; }

# ── Keep JS bundle & assets untouched ────────────────────────────────────────
-keep class com.facebook.react.bridge.JavaScriptModule { *; }

# ── General: keep annotated classes (Parcelable, Serializable) ───────────────
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}
-keepclassmembers class * implements java.io.Serializable {
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readReadResolve();
}

# ── Suppress warnings for optional dependencies ───────────────────────────────
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── PDFBox (react-native-html-to-pdf) ────────────────────────────────────────
# com.gemalto.jp2.JP2Decoder is an optional JPEG2000 codec referenced by
# PDFBox's JPXFilter. It is not shipped with the app and is never called
# at runtime (JPX-encoded PDFs are extremely rare). Safe to ignore.
-dontwarn com.gemalto.jp2.**
-keep class com.tom_roush.pdfbox.** { *; }
