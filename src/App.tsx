import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from 'react-native';
import Toast from 'react-native-root-toast';
import { WebView } from 'react-native-webview';

const { FileDownloader } = NativeModules;

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [isDownloadingFromUrl, setIsDownloadingFromUrl] = useState(false);
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
      setIsDownloadingFromUrl(true);
      setTimeout(() => downloadFile(data.payload), 500);
    } else if (data.type === 'timer') {
      setIsDownloadingFromUrl(true);
      setTimeout(() => {
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
      }, 500);
    }
  };

  const downloadFile = async (url: string) => {
    try {
      const fileName = url.split('/').pop()?.split('?')[0] || 'downloaded_file';
      if (Platform.OS === 'android') {
        await FileDownloader.downloadFile(url, fileName);
        Toast.show(`Downloading ${fileName} to Downloads folder!`, { duration: Toast.durations.LONG });
      } else {
        // iOS implementation would go here
        Toast.show('Downloads are only supported on Android for now.');
      }
    } catch (error) {
      console.error(error);
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

  const downloadNowJs = `
    // Annas Archive tries to detect scraping and will sometimes serve a different page.
    // This is a more robust way to get the download link.
    const findDownloadLink = () => {
      // First, try the original selector
      let downloadButton = document.querySelector('p.mb-4.text-xl.font-bold a');
      if (downloadButton) {
        return downloadButton.href;
      }
      // If that fails, try to find any link that contains "cdn" and the filename from the url.
      const urlParams = new URLSearchParams(window.location.search);
      const filename = urlParams.get('id'); // This is a guess, might need adjustment
      if(filename) {
          const links = Array.from(document.querySelectorAll('a'));
          const cdnLink = links.find(a => a.href.includes('cdn') && a.href.includes(filename));
          if (cdnLink) {
            return cdnLink.href;
          }
      }
      // As a last resort, find the most likely download link on the page
      const allLinks = Array.from(document.querySelectorAll('a'));
      const downloadKeywords = ['download', '.zip', '.epub', '.pdf', '.mobi'];
      for(const link of allLinks) {
          if(downloadKeywords.some(keyword => link.href.includes(keyword))) {
              return link.href;
          }
      }
      return null;
    }

    const downloadInterval = setInterval(() => {
      const downloadLink = findDownloadLink();
      if (downloadLink) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'download-link',
          payload: downloadLink
        }));
        clearInterval(downloadInterval);
      }
    }, 1000);

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
      <View style={isDownloadingFromUrl ? { width: 0, height: 0, opacity: 0 } : { flex: 1, paddingTop: Platform.OS === 'android' ? 40 : 16 }}>
        <TouchableOpacity onPress={() => {
          setSelectedUrl(null);
          setIsDownloadingFromUrl(false);
        }}>
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