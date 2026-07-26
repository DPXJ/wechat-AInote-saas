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
import * as DocumentPicker from "expo-document-picker";
import type { Session } from "@supabase/supabase-js";
import {
  assetUrl,
  createRecord,
  createTodo,
  listRecords,
  listTimeline,
  listTodos,
  type FileTimelineItem,
  type KnowledgeRecord,
  type TodoItem,
} from "@/api";
import { supabase } from "@/supabase";

type TabKey = "files" | "records" | "todos" | "capture";

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
  const [activeTab, setActiveTab] = useState<TabKey>("files");
  const [files, setFiles] = useState<FileTimelineItem[]>([]);
  const [records, setRecords] = useState<KnowledgeRecord[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [captureTags, setCaptureTags] = useState("");
  const [pickedFiles, setPickedFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
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
      const data = await listTimeline();
      setFiles(data.files || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecords() {
    setLoading(true);
    setMessage("");
    try {
      const data = await listRecords();
      setRecords(data.records || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取记录失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadTodos() {
    setLoading(true);
    setMessage("");
    try {
      const data = await listTodos();
      setTodos(data.todos || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取待办失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentTab() {
    if (activeTab === "files") await loadTimeline();
    if (activeTab === "records") await loadRecords();
    if (activeTab === "todos") await loadTodos();
  }

  async function addTodo() {
    if (!newTodo.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      await createTodo(newTodo.trim(), "medium");
      setNewTodo("");
      await loadTodos();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "创建待办失败");
    } finally {
      setLoading(false);
    }
  }

  async function pickFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (!result.canceled) {
      setPickedFiles(result.assets);
      if (!captureTitle && result.assets[0]?.name) setCaptureTitle(result.assets[0].name);
    }
  }

  async function submitCapture() {
    if (!captureText.trim() && pickedFiles.length === 0) {
      setMessage("请先输入内容或选择文件");
      return;
    }

    const form = new FormData();
    form.append("title", captureTitle.trim());
    form.append("sourceLabel", "手机 App");
    form.append("contentText", captureText.trim());
    form.append("userTags", captureTags.trim());
    form.append("syncToNotion", "false");
    form.append("syncToFlomo", "false");

    pickedFiles.forEach((file, index) => {
      form.append("files", {
        uri: file.uri,
        name: file.name || `upload-${index + 1}`,
        type: file.mimeType || "application/octet-stream",
      } as unknown as Blob);
    });

    setLoading(true);
    setMessage("");
    try {
      await createRecord(form);
      setCaptureTitle("");
      setCaptureText("");
      setCaptureTags("");
      setPickedFiles([]);
      setActiveTab("files");
      await loadTimeline();
      setMessage("已保存到文件时间线");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) void loadTimeline();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (activeTab === "records" && records.length === 0) void loadRecords();
    if (activeTab === "todos" && todos.length === 0) void loadTodos();
  }, [activeTab, session]);

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
          <Text style={styles.title}>AI 信迹</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.link}>退出</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {([
          ["files", "文件"] as const,
          ["records", "记录"] as const,
          ["todos", "待办"] as const,
          ["capture", "保存"] as const,
        ]).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            style={[styles.tabButton, activeTab === key && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {activeTab === "capture" ? (
        <View style={styles.capture}>
          <TextInput
            value={captureTitle}
            onChangeText={setCaptureTitle}
            placeholder="标题"
            placeholderTextColor="#71717a"
            style={styles.input}
          />
          <TextInput
            value={captureText}
            onChangeText={setCaptureText}
            placeholder="文字内容或文件补充说明"
            placeholderTextColor="#71717a"
            style={[styles.input, styles.textArea]}
            multiline
          />
          <TextInput
            value={captureTags}
            onChangeText={setCaptureTags}
            placeholder="标签，用空格分隔"
            placeholderTextColor="#71717a"
            style={styles.input}
          />
          <Pressable style={styles.secondaryButton} onPress={pickFiles}>
            <Text style={styles.secondaryText}>{pickedFiles.length ? `已选择 ${pickedFiles.length} 个文件` : "选择文件"}</Text>
          </Pressable>
          {pickedFiles.map((file) => (
            <Text key={file.uri} style={styles.fileMeta} numberOfLines={1}>{file.name}</Text>
          ))}
          <Pressable style={styles.primaryButton} onPress={submitCapture} disabled={loading}>
            <Text style={styles.primaryText}>{loading ? "保存中..." : "保存到 AI 信迹"}</Text>
          </Pressable>
        </View>
      ) : loading && ((activeTab === "files" && files.length === 0) || (activeTab === "records" && records.length === 0) || (activeTab === "todos" && todos.length === 0)) ? (
        <ActivityIndicator color="#8b5cf6" style={{ marginTop: 40 }} />
      ) : activeTab === "files" ? (
        <FlatList
          data={groupedFiles}
          keyExtractor={({ file }) => file.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={refreshCurrentTab}
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
      ) : activeTab === "records" ? (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={refreshCurrentTab}
          renderItem={({ item }) => (
            <View style={styles.fileCard}>
              <Text style={styles.fileName} numberOfLines={1}>{item.title || "未命名记录"}</Text>
              <Text style={styles.fileMeta}>{formatDate(item.createdAt)} · {item.sourceLabel || "AI 信迹"}</Text>
              <Text style={styles.fileDesc} numberOfLines={3}>{item.summary || item.contentText || "暂无摘要"}</Text>
              <View style={styles.tagRow}>
                {(item.tags || []).slice(0, 4).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={todos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.todoComposer}>
              <TextInput
                value={newTodo}
                onChangeText={setNewTodo}
                placeholder="新增待办"
                placeholderTextColor="#71717a"
                style={[styles.input, styles.todoInput]}
              />
              <Pressable style={styles.addButton} onPress={addTodo} disabled={loading}>
                <Text style={styles.primaryText}>添加</Text>
              </Pressable>
            </View>
          }
          refreshing={loading}
          onRefresh={refreshCurrentTab}
          renderItem={({ item }) => (
            <View style={styles.fileCard}>
              <Text style={styles.fileName}>{item.content}</Text>
              <Text style={styles.fileMeta}>{item.priority} · {formatDate(item.createdAt)}</Text>
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#27272a",
  },
  tabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#18181b",
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: { backgroundColor: "#8b5cf6" },
  tabText: { color: "#a1a1aa", fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  list: { padding: 16, paddingBottom: 40 },
  capture: { padding: 16, gap: 12 },
  textArea: { minHeight: 130, paddingTop: 14, textAlignVertical: "top" },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#d4d4d8", fontWeight: "700" },
  todoComposer: { flexDirection: "row", gap: 10, marginBottom: 12 },
  todoInput: { flex: 1 },
  addButton: {
    width: 72,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
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
