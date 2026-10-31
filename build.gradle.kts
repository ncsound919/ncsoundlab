// Pure-Kotlin DSP library (NC Studio core plugin prototype) living beside the
// TypeScript app. It is NOT part of any current build: nc-studio no longer
// includes it, because no app imports `com.overlay.dsp` and the shipping plugin
// set comes from shared/kotlin-core. Kept for reference (its FFT
// spectral-subtraction denoiser is not in the shared gate). To wire it in again,
// add `include(":newdsp")` in nc-studio/settings.gradle.kts and override the
// projectDir to this folder; plugin versions then come from that root
// classpath — never declare them here, or Gradle rejects the duplicate request.
plugins {
    id("com.android.library")
}

android {
    namespace = "com.overlay.dsp"
    compileSdk { version = release(36) { minorApiLevel = 1 } }

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    // Sources sit under `app/src` (the folder name of the sibling TS app),
    // not the module-relative `src/main` default. Both the java and kotlin
    // source sets need it: AGP's built-in Kotlin compiles from `kotlin`, and
    // overriding only `java` leaves compileDebugKotlin with NO-SOURCE.
    sourceSets {
        getByName("main") {
            java.setSrcDirs(listOf("app/src/main/java"))
            kotlin.setSrcDirs(listOf("app/src/main/java"))
        }
        getByName("test") {
            java.setSrcDirs(listOf("app/src/test/java"))
            kotlin.setSrcDirs(listOf("app/src/test/java"))
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
