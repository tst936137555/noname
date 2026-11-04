import java.util.Properties
import groovy.json.JsonSlurper

val signingProperties = Properties()
val signingPropertiesFile = rootProject.file("keystore.properties")
if (signingPropertiesFile.exists()) {
    signingPropertiesFile.inputStream().use(signingProperties::load)
}

fun signingValue(propertyName: String, environmentName: String): String? =
    System.getenv(environmentName)?.takeIf(String::isNotBlank)
        ?: signingProperties.getProperty(propertyName)?.takeIf(String::isNotBlank)

val releaseStoreFile = signingValue("storeFile", "ANDROID_KEYSTORE_PATH")
val releaseStorePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
val releaseSigningConfigured = listOf(
    releaseStoreFile,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { it != null }

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Use the same game manifest as the web and desktop builds.
val gameVersion = (JsonSlurper().parse(rootProject.file("../../../core/package.json")) as Map<*, *>)["version"] as String
val gameVersionParts = gameVersion.split(".").map(String::toInt)
require(gameVersionParts.size == 3 && gameVersionParts[1] in 0..999 && gameVersionParts[2] in 0..999)
val gameVersionCode = gameVersionParts[0] * 1000000 + gameVersionParts[1] * 1000 + gameVersionParts[2]
require(gameVersionCode in 1..2100000000)

android {
    namespace = "com.libnoname.noname"
    compileSdk = rootProject.extra["compileSdkVersion"] as Int

    defaultConfig {
        applicationId = "com.libnoname.noname"
        minSdk = rootProject.extra["minSdkVersion"] as Int
        targetSdk = rootProject.extra["targetSdkVersion"] as Int
        versionCode = gameVersionCode
        versionName = gameVersion

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        androidResources {
            // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
            // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
        }
    }

    if (releaseSigningConfigured) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
        logger.lifecycle("Release signing is configured.")
    } else {
        logger.warn("Release signing is not configured; falling back to the debug keystore.")
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
            manifestPlaceholders["enableAnalytics"] = "true"
        }

        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            manifestPlaceholders["enableAnalytics"] = "false"
            signingConfig = if (releaseSigningConfigured) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }
}

repositories {
    flatDir {
        dirs(
            "../capacitor-cordova-android-plugins/src/main/libs",
            "libs"
        )
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation("androidx.appcompat:appcompat:${rootProject.extra["androidxAppCompatVersion"]}")
    implementation("androidx.coordinatorlayout:coordinatorlayout:${rootProject.extra["androidxCoordinatorLayoutVersion"]}")
    implementation("androidx.core:core-splashscreen:${rootProject.extra["coreSplashScreenVersion"]}")
    implementation("androidx.webkit:webkit:${rootProject.extra["androidxWebkitVersion"]}")
    implementation("androidx.documentfile:documentfile:${rootProject.extra["androidxDocumentfileVersion"]}")

    implementation(project(":capacitor-android"))
    implementation(project(":capacitor-cordova-android-plugins"))

    testImplementation("junit:junit:${rootProject.extra["junitVersion"]}")
    androidTestImplementation("androidx.test.ext:junit:${rootProject.extra["androidxJunitVersion"]}")
    androidTestImplementation("androidx.test.espresso:espresso-core:${rootProject.extra["androidxEspressoCoreVersion"]}")
}

// apply from: 'capacitor.build.gradle'
apply(from = "capacitor.build.gradle")

// google-services 检测
val servicesJSON = file("google-services.json")
if (servicesJSON.exists() && servicesJSON.readText().isNotEmpty()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}

