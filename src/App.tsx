import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import RNFS from 'react-native-fs';
import Toast from 'react-native-root-toast';
import { WebView } from 'react-native-webview';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [clickedLinks, setClickedLinks] = useState<string[]>([]);
  const webviewRef = useRef<WebView>(null);
  const colorScheme = useColorScheme();

  const handleSearch = () => {
    setLoading(true);
    setResults([]);
    setScraping(false);
  };

  const handleMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'initial-results') {
      setResults(data.payload);
      setLoading(false);
      setScraping(true);
      setCurrentResultIndex(0);
    } else if (data.type === 'slow-link') {
      const newResults = [...results];
      newResults[data.index].slowLink = data.payload;
      setResults(newResults);
      if (data.index < newResults.length - 1) {
        setCurrentResultIndex(data.index + 1);
      } else {
        setScraping(false);
      }
    } else if (data.type === 'download-link') {
      downloadFile(data.payload);
    } else if (data.type === 'timer') {
      try {
        Toast.show(`Download will be ready in ${data.payload} seconds`, {
          duration: 3000,
          position: Toast.positions.BOTTOM,
          shadow: true,
          animation: true,
          hideOnPress: true,
          delay: 0,
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const downloadFile = async (url: string) => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Storage Permission Required',
            message: 'This app needs access to your storage to download files.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Toast.show('Storage permission denied');
          return;
        }
      } catch (err) {
        console.warn(err);
        return;
      }
    }

    const fileName = url.split('/').pop();
    const downloadDest = `${RNFS.DownloadDirectoryPath}/${fileName}`;

    const channelId = await notifee.createChannel({
      id: 'download',
      name: 'Download',
      importance: AndroidImportance.HIGH,
    });

    await notifee.displayNotification({
      id: fileName,
      title: `Downloading ${fileName}`,
      body: 'Download in progress',
      android: {
        channelId,
        progress: {
          max: 100,
          current: 0,
        },
        asForegroundService: true,
        ongoing: true,
        autoCancel: false,
      },
    });

    const options: RNFS.DownloadOptions = {
      fromUrl: url,
      toFile: downloadDest,
      background: true,
      progress: (res) => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        notifee.displayNotification({
          id: fileName,
          title: `Downloading ${fileName}`,
          body: `${Math.round(progress)}%`,
          android: {
            channelId,
            progress: {
              max: 100,
              current: Math.round(progress),
            },
            asForegroundService: true,
            ongoing: true,
            autoCancel: false,
          },
        });
      },
    };

    try {
      const job = RNFS.download(options);
      const result = await job.promise;

      if (result.statusCode === 200) {
        await notifee.displayNotification({
          id: fileName,
          title: `Download Complete`,
          body: fileName,
          android: {
            channelId,
            actions: [
              {
                title: 'Open',
                pressAction: {
                  id: 'open',
                },
              },
            ],
          },
        });
        Toast.show(`Downloaded ${fileName} to Downloads folder!`);
      } else {
        throw new Error(`Server returned status code ${result.statusCode}`);
      }
    } catch (error) {
      console.error(error);
      await notifee.displayNotification({
        id: fileName,
        title: 'Download Failed',
        body: `Failed to download ${fileName}`,
        android: {
          channelId,
        },
      });
      Toast.show('Download failed');
    }
  };


  const getInitialResultsJs = `
    const results = [];
    const aarecordList = document.getElementById('aarecord-list');
    if (aarecordList) {
      const items = aarecordList.querySelectorAll('a');
      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const title = item.querySelector('h3').innerText;
        const url = item.href;
        const imageDiv = item.querySelector('div[id^="list_cover_aarecord_id__md5:"]');
        let image = null;
        if (imageDiv) {
            const imgTag = imageDiv.querySelector('img');
            if (imgTag) {
                image = imgTag.src;
            }
        }
        results.push({ title: title, url: url, image: image });
      }
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'initial-results', payload: results }));
  `;

  const getSlowLinkJs = (index: number) => `
    const slowLink = document.querySelector('a[href*="slow_download"]');
    if (slowLink) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'slow-link', payload: slowLink.href, index: ${index} }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'slow-link', payload: 'Not found', index: ${index} }));
    }
  `;

  // Write this javascript into the DOM directly so annas archive doesn't fuck with it (and to facilitate debugging)
  const downloadNowJs = `
    window.__RNWebViewDebug = function() {
      const downloadInterval = setInterval(() => {
        const downloadButton = document.querySelector('p.mb-4.text-xl.font-bold a');
        if (downloadButton) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'download-link',
            payload: downloadButton.href
          }));
          clearInterval(downloadInterval);
        }
      }, 1000);
    };
    window.__RNWebViewDebug();

    const timerInterval = setInterval(() => {
      const timer = document.querySelector('span.js-partner-countdown');
      if (timer) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timer', payload: timer.innerText }));
        clearInterval(timerInterval);
      }
    }, 1000);
  `;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      paddingTop: Platform.OS === 'android' ? 40 : 16,
    },
    searchContainer: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    input: {
      flex: 1,
      borderColor: colorScheme === 'light' ? '#ccc' : '#555',
      borderWidth: 1,
      padding: 8,
      marginRight: 8,
      color: Colors[colorScheme ?? 'light'].text,
    },
    resultItem: {
      marginBottom: 16,
      flexDirection: 'row',
    },
    link: {
      color: Colors[colorScheme ?? 'light'].tint,
    },
    resultTextContainer: {
      flex: 1,
    },
    image: {
        width: 100,
        height: 100,
        marginRight: 10,
    },
    titleText: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    clickedLink: {
      color: 'purple',
    }
  });

  if (selectedUrl) {
    return (
      <View style={{ flex: 1, paddingTop: Platform.OS === 'android' ? 40 : 16 }}>
        <TouchableOpacity onPress={() => setSelectedUrl(null)}>
          <Text style={{ color: Colors[colorScheme ?? 'light'].tint, padding: 10 }}>Close</Text>
        </TouchableOpacity>
        <WebView
          ref={webviewRef}
          source={{ uri: selectedUrl }}
          injectedJavaScript={downloadNowJs}
          onMessage={handleMessage}
          webviewDebuggingEnabled={true}
        />
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Anna's Archive Search</ThemedText>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter search term"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          placeholderTextColor={Colors[colorScheme ?? 'light'].text}
        />
        <TouchableOpacity
          style={{
            backgroundColor: Colors[colorScheme ?? 'light'].tint,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 4,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={handleSearch}
        >
          <Text style={{ color: Colors[colorScheme ?? 'light'].background, fontWeight: 'bold' }}>
            Search
          </Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />}
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.resultItem}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.image} />
              ) : (
                <View style={[styles.image, { backgroundColor: 'white' }]} />
              )}
              <View style={styles.resultTextContainer}>
                <Text selectable={true} style={[styles.titleText, { color: Colors[colorScheme ?? 'light'].text }]}>{item.title}</Text>
                {item.slowLink ? (
                  <TouchableOpacity onPress={() => {
                    setSelectedUrl(item.slowLink);
                    setClickedLinks([...clickedLinks, item.slowLink]);
                  }}>
                    <Text selectable={true} style={[styles.link, clickedLinks.includes(item.slowLink) && styles.clickedLink]}>{item.slowLink}</Text>
                  </TouchableOpacity>
                ) : (
                  <ActivityIndicator color={Colors[colorScheme ?? 'light'].tint} />
                )}
              </View>
            </View>
          )}
          ListFooterComponent={scraping ? <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} /> : null}
        />
      )}
      {(loading || scraping) && (
        <WebView
          ref={webviewRef}
          source={{
            uri: scraping
              ? results[currentResultIndex].url
              : `https://annas-archive.org/search?q=${searchQuery.split(' ').join('+')}`,
          }}
          onMessage={handleMessage}
          injectedJavaScript={scraping ? getSlowLinkJs(currentResultIndex) : getInitialResultsJs}
          style={{ width: 0, height: 0, opacity: 0 }} // Hide the WebView
        />
      )}
    </ThemedView>
  );
}

export default App;