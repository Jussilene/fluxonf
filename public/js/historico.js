// public/js/historico.js

// Formata "2025-12-10T19:57:07.680Z" -> "10/12/2025 16:57"
function formatDateTimeBr(isoString) {
  if (!isoString) return "N/D";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "N/D";

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();

  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

function renderHistoricoTabela(lista) {
  const tbody = document.getElementById("historicoTableBody");
  const emptyState = document.getElementById("historicoEmptyState");

  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(lista) || lista.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  lista.forEach((item) => {
    const tr = document.createElement("tr");

    const dataHora = formatDateTimeBr(item.dataHora);
    const empresa =
      item.empresaNome ||
      item.empresaId ||
      "(sem empresa vinculada)";

    const tipoLabel =
      item.tipo === "lote"
        ? "Lote (todas as empresas)"
        : item.tipo === "manual"
        ? "Manual / Único"
        : item.tipo || "N/D";

    const total = item.totalArquivos ?? 0;
    const status = (item.status || "").toLowerCase();

    let statusLabel = item.status || "N/D";
    let statusClasses =
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold";

    if (status === "sucesso") {
      statusClasses += " bg-emerald-100 text-emerald-700";
    } else if (status === "erro") {
      statusClasses += " bg-rose-100 text-rose-700";
    } else if (status === "simulado" || status === "parcial") {
      statusClasses += " bg-amber-100 text-amber-700";
    } else {
      statusClasses += " bg-slate-100 text-slate-600";
    }

    const detalhes = item.detalhes || "";

    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-700">${dataHora}</td>
      <td class="px-3 py-2 text-slate-700">${empresa}</td>
      <td class="px-3 py-2 text-slate-600">${tipoLabel}</td>
      <td class="px-3 py-2 text-slate-700">${total}</td>
      <td class="px-3 py-2">
        <span class="${statusClasses}">${statusLabel}</span>
      </td>
      <td class="px-3 py-2 text-slate-600" title="${detalhes.replace(
        /"/g,
        "&quot;"
      )}">
        ${detalhes ? detalhes : "-"}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function carregarHistoricoExecucoes() {
  const btn = document.getElementById("btnReloadHistorico");
  if (btn) btn.disabled = true;

  try {
    const resp = await fetch("/api/historico");
    const data = await resp.json();

    if (!data.ok) {
      console.error("Erro ao buscar histórico:", data);
      renderHistoricoTabela([]);
      return;
    }

    renderHistoricoTabela(data.historico || []);
  } catch (err) {
    console.error("Erro ao buscar histórico:", err);
    renderHistoricoTabela([]);
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const historicoTabButton = document.querySelector('[data-tab="historico"]');
  const reloadBtn = document.getElementById("btnReloadHistorico");

  // Quando clicar na aba HISTÓRICO, carrega os dados
  if (historicoTabButton) {
    historicoTabButton.addEventListener("click", () => {
      carregarHistoricoExecucoes();
    });
  }

  // Botão "Atualizar histórico"
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      carregarHistoricoExecucoes();
    });
  }
});
