import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, assetUrl, type FileTimelineItem } from "@/api";
import { supabase } from "@/supabase";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export default function AppHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<FileTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const groupedFiles = useMemo(() => {
    return files.map((file, index) => {
      const current = formatDate(file.createdAt);
      const previous = index > 0 ? formatDate(files[index - 1].createdAt) : "";
      return { file, showDate: current !== previous ? current : "" };
    });
  }, [files]);

  async function signIn() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage(error.message);
    setLoading(false);
  }

  async function loadTimeline() {
    setLoading(true);
    setMessage("");
    try {
      const data = await apiFetch<{ files: FileTimelineItem[] }>("/api/files/timeline?limit=80");
      setFiles(data.files || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) void loadTimeline();
  }, [session]);

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loginCard}>
          <Text style={styles.logo}>AI 信迹</Text>
          <Text style={styles.subtitle}>原生 App 登录云端资料库</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="邮箱"
            placeholderTextColor="#71717a"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="密码"
            placeholderTextColor="#71717a"
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={signIn} disabled={loading}>
            <Text style={styles.primaryText}>{loading ? "登录中..." : "登录"}</Text>
          </Pressable>
          {message ? <Text style={styles.error}>{message}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>文件时间线</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.link}>退出</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {loading && files.length === 0 ? (
        <ActivityIndicator color="#8b5cf6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groupedFiles}
          keyExtractor={({ file }) => file.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadTimeline}
          renderItem={({ item }) => (
            <View>
              {item.showDate ? <Text style={styles.date}>{item.showDate}</Text> : null}
              <Pressable style={styles.fileCard} onPress={() => Linking.openURL(assetUrl(item.file.id))}>
                <Text style={styles.fileName} numberOfLines={1}>{item.file.originalName}</Text>
                <Text style={styles.fileMeta}>{formatSize(item.file.byteSize)} · {item.file.recordTitle}</Text>
                <Text style={styles.fileDesc} numberOfLines={2}>
                  {item.file.description || item.file.recordSummary || "暂无描述"}
                </Text>
                <View style={styles.tagRow}>
                  {item.file.tags.slice(0, 4).map((tag) => (
                    <Text key={tag} style={styles.tag}>#{tag}</Text>
                  ))}
                </View>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#09090b" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#27272a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#a1a1aa", marginTop: 4, fontSize: 13 },
  logo: { color: "#a78bfa", fontSize: 30, fontWeight: "800", textAlign: "center" },
  loginCard: { flex: 1, justifyContent: "center", paddingHorizontal: 26, gap: 14 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#18181b",
    color: "#fafafa",
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 16,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#fb7185", paddingHorizontal: 20, paddingTop: 12 },
  link: { color: "#a78bfa", fontWeight: "700" },
  list: { padding: 16, paddingBottom: 40 },
  date: { color: "#a1a1aa", marginBottom: 10, marginTop: 8, fontWeight: "700" },
  fileCard: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27272a",
    padding: 16,
    marginBottom: 12,
  },
  fileName: { color: "#fafafa", fontSize: 16, fontWeight: "700" },
  fileMeta: { color: "#71717a", fontSize: 12, marginTop: 6 },
  fileDesc: { color: "#d4d4d8", fontSize: 13, lineHeight: 20, marginTop: 10 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { color: "#c4b5fd", backgroundColor: "#27272a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
